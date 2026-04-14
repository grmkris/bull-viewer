import type { AnyRouter, RouterClient } from "@orpc/server";
import { call } from "@orpc/server";

import { resolveClientFn, resolveProcedure } from "./resolver.ts";

/**
 * Build a dispatch function that runs procedures in-process via
 * `@orpc/server`'s `call()` helper. The full middleware chain (auth,
 * scope, readOnly, typed errors) executes identically to an HTTP
 * request — this is the same pattern `packages/api/test/harness.ts`
 * uses for unit tests.
 *
 * Intended for Mode A (HTTP mounted inside the standalone server),
 * where the handler has already built a `ViewerContext` and is simply
 * reusing it for the MCP tool call.
 */
export const createInProcessDispatch = <
  TRouter extends AnyRouter,
  TContext extends Record<string, unknown>,
>(
  router: TRouter,
  context: TContext
) => {
  return async (path: readonly string[], input: unknown): Promise<unknown> => {
    // oxlint-disable-next-line no-unsafe-type-assertion -- path walk yields an unknown leaf; `call` validates shape at runtime
    const procedure = resolveProcedure(router, path) as Parameters<
      typeof call
    >[0];
    return call(procedure, input, { context });
  };
};

/**
 * Build a dispatch function that forwards each tool call through an
 * oRPC client (typically an `RPCLink` pointed at a remote bull-viewer
 * instance). The router is only used for schema introspection at walk
 * time; the client handles actual RPC execution.
 *
 * Intended for Mode B (stdio subprocess), where the MCP server runs on
 * the developer's machine and the actual BullMQ registry lives on a
 * remote server.
 */
export const createClientDispatch = (client: RouterClient<AnyRouter>) => {
  return async (path: readonly string[], input: unknown): Promise<unknown> => {
    const fn = resolveClientFn(client, path);
    return fn(input ?? {});
  };
};
