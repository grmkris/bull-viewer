import {
  subscribeQueueEvents,
  type QueueRegistry,
  type SearchProvider,
} from "@bull-viewer/core/server";
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

export interface CreateQueuesApiHandlerOptions {
  registry: QueueRegistry;
  authorize?: Authorize;
  basePath?: string;
  readOnly?: boolean;
  /**
   * Pluggable search backend. Defaults to the built-in Redis SCAN provider.
   * Host apps can inject a Postgres / Meilisearch / Elastic adapter here;
   * it flows through `ViewerContext.searchProvider` and is read by the
   * `search.jobs` procedure. Replaces the old module-level `setSearchProvider`
   * which had a dual-package hazard.
   */
  searchProvider?: SearchProvider;
  /**
   * Expose auto-generated OpenAPI docs + REST surface at `${basePath}/rest/*`.
   *
   * Default: **on in dev/test, off in production**. Set `true` to force-enable
   * (useful for self-hosted dashboards that want API docs) or `false` to
   * force-disable.
   */
  openapi?: boolean;
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
 * Single mounted handler that dispatches to:
 *   - `${basePath}/rpc/*`    → oRPC RPCHandler (typed RPC)
 *   - `${basePath}/rest/*`   → oRPC OpenAPIHandler (REST + Scalar docs, off in prod)
 *   - `${basePath}/queues/:name/events` → Server-Sent Events stream
 *
 * The SSE path is intentionally kept outside the RPC layer so existing
 * `EventSource` consumers continue to work without touching async
 * iterator plumbing. Everything else flows through a single typed router.
 */
export function createQueuesApiHandler(
  options: CreateQueuesApiHandlerOptions,
): Handler {
  const basePath = normalizeBasePath(options.basePath);

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
                  "REST mirror of the oRPC router. Use `/rpc/*` for typed RPC, `/rest/*` for OpenAPI-compatible access, or open this page in a browser for interactive Scalar docs.",
              },
            },
          }),
        ],
      })
    : null;

  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    let pathname = url.pathname;
    if (basePath && pathname.startsWith(basePath)) {
      pathname = pathname.slice(basePath.length) || "/";
    }
    if (!pathname.startsWith("/")) pathname = `/${pathname}`;

    // Resolve viewer + scopes. Short-circuits with 401/403 on auth failure.
    const ctxOrResponse = await buildContext(req, {
      registry: options.registry,
      authorize: options.authorize,
      readOnly: options.readOnly,
      searchProvider: options.searchProvider,
    });
    if (ctxOrResponse instanceof Response) return ctxOrResponse;
    const context: ViewerContext = ctxOrResponse;

    // 1) Raw SSE stream (kept outside oRPC for EventSource compatibility)
    const sseMatch = pathname.match(/^\/queues\/([^/]+)\/events\/?$/);
    if (sseMatch && req.method === "GET") {
      if (!context.scopes.has("read")) {
        return jsonResponse({ error: "requires scope: read" }, 403);
      }
      const queueName = decodeURIComponent(sseMatch[1]!);
      const queue = context.registry.getQueue(queueName);
      if (!queue) return jsonResponse({ error: "queue not found" }, 404);
      return sseResponse(req, queueName, context.registry.connection);
    }

    // 2) oRPC typed RPC surface
    if (pathname.startsWith("/rpc")) {
      const rpcPrefix = `${basePath}/rpc` as `/${string}`;
      const { matched, response } = await rpcHandler.handle(req, {
        prefix: rpcPrefix,
        context,
      });
      if (matched) return response;
    }

    // 3) Auto-generated REST + Scalar docs (dev/opt-in only)
    if (openapiHandler && pathname.startsWith("/rest")) {
      const restPrefix = `${basePath}/rest` as `/${string}`;
      const { matched, response } = await openapiHandler.handle(req, {
        prefix: restPrefix,
        context,
      });
      if (matched) return response;
    }

    return jsonResponse({ error: "not found" }, 404);
  };
}

function sseResponse(
  req: Request,
  queueName: string,
  connection: ConnectionOptions,
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

      send(JSON.stringify({ type: "hello", queue: queueName }), "hello");

      const hb = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(`:heartbeat\n\n`));
        } catch {
          /* closed */
        }
      }, 15_000);

      unsubscribe = subscribeQueueEvents(queueName, connection, (event) => {
        send(JSON.stringify(event), "job");
      });

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
