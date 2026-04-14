import { subscribeQueueEvents } from "@grmkris/bull-viewer-core/server";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { RPCHandler } from "@orpc/server/fetch";
import { BodyLimitPlugin, CompressionPlugin } from "@orpc/server/fetch";
import { BatchHandlerPlugin } from "@orpc/server/plugins";
import {
  ZodToJsonSchemaConverter,
  experimental_ZodSmartCoercionPlugin,
} from "@orpc/zod/zod4";
import type { ConnectionOptions } from "bullmq";

import { appRouter } from "../router.ts";
import { buildContext, type Authorize, type ViewerContext } from "./context.ts";
import { createConsoleLogger, type Logger } from "./logger.ts";
import { normalizeTenantOptions, type TenantOptionsInput } from "./tenants.ts";

export interface CreateQueuesApiHandlerOptions extends TenantOptionsInput {
  authorize?: Authorize;
  basePath?: string;
  readOnly?: boolean;
  /**
   * Expose auto-generated OpenAPI docs + REST surface at
   * `${basePath}/tenants/:tenant/rest/*` (and the legacy `${basePath}/rest/*`
   * shortcut for the default tenant).
   *
   * Default: **on in dev/test, off in production**. Set `true` to force-enable
   * (useful for self-hosted dashboards that want API docs) or `false` to
   * force-disable.
   */
  openapi?: boolean;
  /**
   * Root logger. Every request gets a child with `requestId`, `procedure`,
   * and `tenant` fields merged. Defaults to a console-backed logger
   * honoring `BULL_VIEWER_LOG_LEVEL` (debug | info | warn | error, default info).
   */
  logger?: Logger;
}

export type Handler = (req: Request) => Promise<Response>;

/**
 * Normalize a base-path option to always start with `/` and never end with
 * one. Empty / undefined / "/" becomes `""` (root mount).
 *
 *   normalizeBasePath("api")     === "/api"
 *   normalizeBasePath("/api/")   === "/api"
 *   normalizeBasePath("/")       === ""
 *   normalizeBasePath(undefined) === ""
 */
function normalizeBasePath(input: string | undefined): string {
  if (!input) return "";
  let s = input.trim();
  if (s === "/" || s === "") return "";
  if (!s.startsWith("/")) s = `/${s}`;
  if (s.endsWith("/")) s = s.slice(0, -1);
  return s;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function shouldEnableOpenApi(flag: boolean | undefined): boolean {
  if (flag === true) return true;
  if (flag === false) return false;
  // Default: enabled unless NODE_ENV === "production"
  const env =
    typeof process !== "undefined" && process.env?.NODE_ENV
      ? process.env.NODE_ENV
      : "development";
  return env !== "production";
}

/**
 * Match `/tenants/:id` or `/tenants/:id/<rest...>` and extract both halves.
 * Returns `null` when the pathname doesn't start with the tenant prefix —
 * the caller falls back to the default tenant in that case.
 */
function matchTenantPrefix(
  pathname: string
): { tenantId: string; remaining: string } | null {
  const m = pathname.match(/^\/tenants\/([^/]+)(\/.*)?$/);
  if (!m) return null;
  return {
    tenantId: decodeURIComponent(m[1]!),
    remaining: m[2] && m[2] !== "" ? m[2] : "/",
  };
}

/**
 * Single mounted handler. Dispatches every incoming request through one of:
 *
 *   - `${basePath}/tenants`                                 → meta endpoint (tenant list)
 *   - `${basePath}/tenants/:tenant/rpc/*`                   → oRPC RPCHandler
 *   - `${basePath}/tenants/:tenant/rest/*`                  → OpenAPI + Scalar docs
 *   - `${basePath}/tenants/:tenant/queues/:name/events`     → SSE stream (scoped per tenant)
 *   - `${basePath}/rpc/*`                                   → legacy single-tenant alias for the default tenant
 *   - `${basePath}/rest/*`                                  → legacy single-tenant alias
 *   - `${basePath}/queues/:name/events`                     → legacy single-tenant SSE
 *
 * The RPC and OpenAPI handlers are constructed **once** at factory time and
 * reused across all tenants — the per-call `prefix` option lets one handler
 * serve any tenant URL without rebuilding the router.
 */
export function createQueuesApiHandler(
  options: CreateQueuesApiHandlerOptions
): Handler {
  const basePath = normalizeBasePath(options.basePath);
  const rootLogger = options.logger ?? createConsoleLogger();
  const { tenants, defaultTenantId } = normalizeTenantOptions(options);

  const rpcHandler = new RPCHandler(appRouter, {
    plugins: [
      new BodyLimitPlugin({ maxBodySize: 1 * 1024 * 1024 }),
      new CompressionPlugin(),
      new BatchHandlerPlugin(),
    ],
  });

  const openapiHandler = shouldEnableOpenApi(options.openapi)
    ? new OpenAPIHandler(appRouter, {
        plugins: [
          new experimental_ZodSmartCoercionPlugin(),
          new OpenAPIReferencePlugin({
            docsProvider: "scalar",
            schemaConverters: [new ZodToJsonSchemaConverter()],
            specGenerateOptions: {
              info: {
                title: "BullMQ Viewer API",
                version: "1.0.0",
                description:
                  "REST mirror of the oRPC router. Each tenant gets its own surface at `/tenants/:tenant/rest/*`. The legacy `/rest/*` path resolves to the default tenant.",
              },
            },
          }),
        ],
      })
    : null;

  return async (req: Request): Promise<Response> => {
    const startedAt = Date.now();
    const url = new URL(req.url);
    let pathname = url.pathname;
    if (basePath && pathname.startsWith(basePath)) {
      pathname = pathname.slice(basePath.length) || "/";
    }
    if (!pathname.startsWith("/")) pathname = `/${pathname}`;

    // 0) Tenant list meta endpoint — special-case before any tenant
    //    resolution. Still runs `authorize` so the list isn't world-readable.
    if (
      (pathname === "/tenants" || pathname === "/tenants/") &&
      req.method === "GET"
    ) {
      if (options.authorize) {
        const result = await options.authorize(req);
        if (!result.ok) {
          return jsonResponse(
            { error: result.message ?? "unauthorized" },
            result.status ?? 401
          );
        }
      }
      const list = [...tenants.entries()].map(([id, t]) => ({
        id,
        label: t.label ?? id,
        queueCount: t.registry.listQueueNames().length,
      }));
      rootLogger.info("tenants.list ✓ meta", {
        count: list.length,
        durationMs: Date.now() - startedAt,
      });
      return jsonResponse({ tenants: list, default: defaultTenantId });
    }

    // 1) Resolve tenant: prefer explicit `/tenants/:id/...` prefix, else
    //    fall back to the default tenant for legacy paths.
    let tenantId: string;
    let scopedPathname: string;
    let usingTenantPrefix: boolean;
    const tenantMatch = matchTenantPrefix(pathname);
    if (tenantMatch) {
      tenantId = tenantMatch.tenantId;
      scopedPathname = tenantMatch.remaining;
      usingTenantPrefix = true;
    } else {
      tenantId = defaultTenantId;
      scopedPathname = pathname;
      usingTenantPrefix = false;
    }

    const tenant = tenants.get(tenantId);
    if (!tenant) {
      const known = [...tenants.keys()].join(", ");
      rootLogger.warn(`tenants.unknown ✗`, {
        tenant: tenantId,
        known,
        durationMs: Date.now() - startedAt,
      });
      return jsonResponse(
        { error: `unknown tenant: ${tenantId}`, known: [...tenants.keys()] },
        404
      );
    }

    const procedure = derivePath(scopedPathname, tenantId);

    // 2) Resolve viewer + scopes against the picked tenant. Short-circuits
    //    with 401/403 on auth failure.
    const ctxOrResponse = await buildContext(req, {
      registry: tenant.registry,
      authorize: options.authorize,
      readOnly: options.readOnly,
      searchProvider: tenant.searchProvider ?? options.searchProvider,
      logger: rootLogger,
      procedure,
      tenantId,
    });
    if (ctxOrResponse instanceof Response) {
      rootLogger.warn(`${procedure} ✗ auth`, {
        tenant: tenantId,
        status: ctxOrResponse.status,
        durationMs: Date.now() - startedAt,
      });
      return ctxOrResponse;
    }
    const context: ViewerContext = ctxOrResponse;

    const finish = (response: Response, tag = "rpc") => {
      const level =
        response.status >= 500
          ? "error"
          : response.status >= 400
            ? "warn"
            : "info";
      context.logger[level](
        `${procedure} ${response.status < 400 ? "✓" : "✗"} ${tag}`,
        {
          status: response.status,
          durationMs: Date.now() - startedAt,
        }
      );
      return response;
    };

    // 3) Raw SSE stream — kept outside oRPC so EventSource keeps working.
    //    Subscription is keyed by (tenantId, queueName) so two tenants with
    //    a same-named queue don't alias inside the events multiplexer.
    const sseMatch = scopedPathname.match(/^\/queues\/([^/]+)\/events\/?$/);
    if (sseMatch && req.method === "GET") {
      if (!context.scopes.has("read")) {
        return finish(
          jsonResponse({ error: "requires scope: read" }, 403),
          "sse"
        );
      }
      const queueName = decodeURIComponent(sseMatch[1]!);
      const queue = context.registry.getQueue(queueName);
      if (!queue) {
        return finish(jsonResponse({ error: "queue not found" }, 404), "sse");
      }
      // SSE streams are long-lived — log open, not close.
      context.logger.info(`${procedure} ↻ sse open`, {
        queue: queueName,
        tenant: tenantId,
      });
      return sseResponse(req, queueName, context.registry.connection, tenantId);
    }

    // 4) oRPC typed RPC surface
    if (scopedPathname.startsWith("/rpc")) {
      const rpcPrefix = (
        usingTenantPrefix
          ? `${basePath}/tenants/${tenantId}/rpc`
          : `${basePath}/rpc`
      ) as `/${string}`;
      const { matched, response } = await rpcHandler.handle(req, {
        prefix: rpcPrefix,
        context,
      });
      if (matched) return finish(response, "rpc");
    }

    // 5) Auto-generated REST + Scalar docs (dev/opt-in only)
    if (openapiHandler && scopedPathname.startsWith("/rest")) {
      const restPrefix = (
        usingTenantPrefix
          ? `${basePath}/tenants/${tenantId}/rest`
          : `${basePath}/rest`
      ) as `/${string}`;
      const { matched, response } = await openapiHandler.handle(req, {
        prefix: restPrefix,
        context,
      });
      if (matched) return finish(response, "rest");
    }

    return finish(jsonResponse({ error: "not found" }, 404), "miss");
  };
}

/**
 * Turn a post-basePath, post-tenant URL pathname into a compact procedure
 * identifier for log correlation.
 *
 *   `/rpc/jobs/action`                  → `jobs.action`
 *   `/rest/queues/emails/jobs/12/retry` → `rest:queues.emails.jobs.12.retry`
 *   `/queues/emails/events`             → `sse:queues.emails.events`
 *
 * The tenant id is logged separately on the request-scoped logger, so it
 * isn't repeated in the procedure tag.
 */
function derivePath(pathname: string, _tenantId: string): string {
  const trimmed = pathname.replace(/^\/+|\/+$/g, "");
  if (trimmed.startsWith("rpc/")) {
    return trimmed.slice(4).replace(/\//g, ".");
  }
  if (trimmed.startsWith("rest/")) {
    return `rest:${trimmed.slice(5).replace(/\//g, ".")}`;
  }
  if (trimmed.startsWith("queues/") && trimmed.endsWith("/events")) {
    return `sse:${trimmed.replace(/\//g, ".")}`;
  }
  return trimmed || "/";
}

function sseResponse(
  req: Request,
  queueName: string,
  connection: ConnectionOptions,
  scopeKey: string
): Response {
  let unsubscribe: (() => void) | undefined;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder();
      const send = (data: string, event?: string) => {
        if (closed) return;
        try {
          if (event) controller.enqueue(enc.encode(`event: ${event}\n`));
          controller.enqueue(enc.encode(`data: ${data}\n\n`));
        } catch {
          /* controller closed */
        }
      };

      send(
        JSON.stringify({ type: "hello", queue: queueName, tenant: scopeKey }),
        "hello"
      );

      const hb = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(`:heartbeat\n\n`));
        } catch {
          /* closed */
        }
      }, 15_000);

      unsubscribe = subscribeQueueEvents(
        queueName,
        connection,
        (event) => {
          send(JSON.stringify(event), "job");
        },
        scopeKey
      );

      req.signal?.addEventListener("abort", () => {
        closed = true;
        clearInterval(hb);
        unsubscribe?.();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
    cancel() {
      closed = true;
      unsubscribe?.();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
      connection: "keep-alive",
    },
  });
}
