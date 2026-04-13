import type { Scope } from "@bull-viewer/core";
import { os, ORPCError } from "@orpc/server";

import type { ViewerContext } from "./context.ts";

const o = os.$context<ViewerContext>();

/** Base procedure — no guards. Used for `me`. */
export const publicProcedure = o;

/** Middleware: reject mutating procedures when readOnly mode is on. */
const requireWritableMw = o.middleware(({ context, next }) => {
  if (context.readOnly) {
    throw new ORPCError("FORBIDDEN", { message: "read-only mode" });
  }
  return next({});
});

/** Middleware: require a specific scope on the resolved viewer. */
export const requireScope = (scope: Scope) =>
  o.middleware(({ context, next }) => {
    if (!context.scopes.has(scope)) {
      throw new ORPCError("FORBIDDEN", { message: `requires scope: ${scope}` });
    }
    return next({});
  });

/** Read procedure: requires `read` scope. */
export const readProcedure = publicProcedure.use(requireScope("read"));

/** Scope-gated mutation: blocks in readOnly mode + checks given scope. */
export const scopedMutation = (scope: Scope) =>
  publicProcedure.use(requireWritableMw).use(requireScope(scope));

/** Writable procedure without a fixed scope (for handlers that check scope dynamically). */
export const writableProcedure = publicProcedure.use(requireWritableMw);
