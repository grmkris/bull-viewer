import type { Scope, Viewer } from "@bull-viewer/core";
import { READ_ONLY_SCOPES } from "@bull-viewer/core";
import type { QueueRegistry, SearchProvider } from "@bull-viewer/core/server";
import type { Queue } from "bullmq";

import type { Logger } from "./logger.ts";
import { createConsoleLogger } from "./logger.ts";

export type AuthorizeResult =
  | {
      ok: true;
      viewer?: Viewer | null;
      scopes?: Scope[];
    }
  | {
      ok: false;
      status?: number;
      message?: string;
    };

export type Authorize = (req: Request) => Promise<AuthorizeResult>;

export const ALLOW_ALL: Authorize = async () => ({
  ok: true,
  viewer: null,
  // NOTE: omitting `scopes` here means `buildContext` falls back to
  // READ_ONLY_SCOPES — callers who want write access must opt in explicitly.
});

export interface ViewerContext {
  registry: QueueRegistry;
  viewer: Viewer | null;
  scopes: Set<Scope>;
  readOnly: boolean;
  headers: Headers;
  requestId: string;
  /**
   * Which tenant resolved this request. Always set — single-tenant mode
   * uses the synthesized id `"default"`. Procedures don't usually read
   * this, but the audit hook (and any per-tenant logging) should.
   */
  tenantId: string;
  /**
   * Optional SearchProvider override injected at handler-creation time.
   * Defaults to `RedisScanSearchProvider` when unset. Lives on the context
   * (not module state) to avoid the dual-package hazard the old
   * `setSearchProvider` module-level setter had.
   */
  searchProvider?: SearchProvider;
  /**
   * Request-scoped logger with `requestId` and `procedure` pre-merged.
   * Procedures can read `ctx.logger` to emit correlated log lines without
   * threading a logger through every helper. Defaults to a silent logger
   * in tests and a console logger in production.
   */
  logger: Logger;
  /**
   * Resolved BullMQ Queue, attached by `requireQueueMw` when a procedure
   * uses `queueProcedure` / `writableQueueProcedure` / `scopedQueueMutation`.
   * Always defined for those procedures — the middleware throws
   * `QueueMissing` otherwise. Procedures read it with a single non-null
   * assertion: `const queue = context.queue!`.
   *
   * `undefined` in middleware chains that don't include `requireQueueMw`
   * (e.g. `publicProcedure`, plain `readProcedure`, the `me` procedure).
   */
  queue?: Queue;
}

export interface BuildContextOptions {
  registry: QueueRegistry;
  authorize?: Authorize;
  readOnly?: boolean;
  searchProvider?: SearchProvider;
  /**
   * Parent logger. A request-scoped child will be created off this one
   * with `requestId`, `procedure`, and `tenant` fields attached. Defaults
   * to a `console`-backed logger honoring `BULL_VIEWER_LOG_LEVEL`.
   */
  logger?: Logger;
  /** Procedure path (e.g. `jobs.action`) — merged onto the child logger. */
  procedure?: string;
  /**
   * Tenant id resolved from the URL prefix (or the synthesized `"default"`
   * in single-tenant mode). Plumbed through so audit/logger lines can
   * include which tenant was touched.
   */
  tenantId: string;
}

function newRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

/**
 * Resolve a ViewerContext from an incoming Request. Returns a Response on
 * auth failure so the caller can short-circuit before dispatching to oRPC.
 *
 * When `authorize` returns `ok: true` without an explicit `scopes` array,
 * we grant `READ_ONLY_SCOPES` (just `read`) — not the full `ALL_SCOPES`.
 * This is the intentional fail-closed default so a forgetful `Authorize`
 * implementation can't accidentally hand out destructive permissions.
 */
export async function buildContext(
  req: Request,
  options: BuildContextOptions
): Promise<ViewerContext | Response> {
  const authorize = options.authorize ?? ALLOW_ALL;
  const result = await authorize(req);
  if (!result.ok) {
    return new Response(
      JSON.stringify({ error: result.message ?? "unauthorized" }),
      {
        status: result.status ?? 401,
        headers: { "content-type": "application/json" },
      }
    );
  }
  const requestId = newRequestId();
  const parent = options.logger ?? createConsoleLogger();
  const logger = parent.child({
    requestId,
    tenant: options.tenantId,
    ...(options.procedure ? { procedure: options.procedure } : {}),
  });

  return {
    registry: options.registry,
    viewer: result.viewer ?? null,
    scopes: new Set<Scope>(result.scopes ?? READ_ONLY_SCOPES),
    readOnly: !!options.readOnly,
    headers: req.headers,
    requestId,
    tenantId: options.tenantId,
    searchProvider: options.searchProvider,
    logger,
  };
}
