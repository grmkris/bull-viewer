import type { Scope } from "@grmkris/bull-viewer-core";
import { ORPCError, os } from "@orpc/server";
import type { Queue } from "bullmq";

import type { ViewerContext } from "./context.ts";
import { commonErrors } from "./errors.ts";

const o = os.$context<ViewerContext>().errors(commonErrors);

/**
 * Base procedure — no guards. Used only for `me`.
 *
 * Every procedure built off `publicProcedure` (and its children below)
 * inherits the `errors` typed-error map so handlers can throw
 * `errors.NotFound(...)` / `errors.QueueMissing(...)` / etc. and clients
 * get the full error union as typed data. See `lib/errors.ts`.
 */
export const publicProcedure = o;

/**
 * Middleware: reject mutating procedures when readOnly mode is on.
 * Throws the typed `errors.ReadOnly` so the client can tell "dashboard
 * is read-only" apart from "you don't have permission" (`errors.Forbidden`).
 */
const requireWritableMw = o.middleware(({ context, next, errors }) => {
  if (context.readOnly) {
    throw errors.ReadOnly();
  }
  return next({});
});

/** Middleware: require a specific scope on the resolved viewer. */
export const requireScope = (scope: Scope) =>
  o.middleware(({ context, next, errors }) => {
    if (!context.scopes.has(scope)) {
      throw errors.Forbidden({ message: `requires scope: ${scope}` });
    }
    return next({});
  });

/**
 * Middleware: resolve `input.name` to a BullMQ `Queue` and attach it to
 * context. All queue-scoped procedures use this — eliminates the old
 * `getQueueOr404` boilerplate repeated across every router.
 *
 * Throws `errors.QueueMissing` if the queue name isn't registered on the
 * server's `QueueRegistry`.
 */
const requireQueueMw = o.middleware(
  async ({ context, next, errors }, rawInput) => {
    const input = rawInput as { name?: unknown } | undefined;
    const name = typeof input?.name === "string" ? input.name : undefined;
    if (!name) {
      throw errors.QueueMissing({ message: "input.name required" });
    }
    const queue = context.registry.getQueue(name);
    if (!queue) {
      throw errors.QueueMissing({ message: `queue not found: ${name}` });
    }
    return next({
      context: { ...context, queue } as ViewerContext & { queue: Queue },
    });
  }
);

/** Read procedure: requires `read` scope. */
export const readProcedure = publicProcedure.use(requireScope("read"));

/** Queue-scoped read procedure: `read` scope + resolves `ctx.queue`. */
export const queueProcedure = readProcedure.use(requireQueueMw);

/**
 * Scope-gated mutation: blocks in readOnly mode + checks given scope.
 * Does NOT resolve `ctx.queue` — use `writableQueueProcedure` for the
 * common case.
 */
export const scopedMutation = (scope: Scope) =>
  publicProcedure.use(requireWritableMw).use(requireScope(scope));

/**
 * Scope-gated queue-mutation: readOnly guard + scope check + `ctx.queue`
 * resolution. Used by per-queue mutations like `queues.pause`.
 */
export const scopedQueueMutation = (scope: Scope) =>
  publicProcedure
    .use(requireWritableMw)
    .use(requireScope(scope))
    .use(requireQueueMw);

/**
 * Writable procedure without a fixed scope (handlers check scope
 * dynamically against `input.action`). Used for `jobs.action` and
 * `queues.bulk` where the scope depends on the requested action.
 */
export const writableProcedure = publicProcedure.use(requireWritableMw);

/** Writable procedure that also resolves `ctx.queue`. */
export const writableQueueProcedure = writableProcedure.use(requireQueueMw);

// Touch unused import to keep ORPCError exported in case procedures need it
// for ad-hoc throws — all canonical errors go through `errors.Foo(...)`.
void ORPCError;
