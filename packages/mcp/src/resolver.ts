import type { AnySchema } from "@modelcontextprotocol/sdk/server/zod-compat.js";
import type { AnyRouter, RouterClient } from "@orpc/server";

/**
 * Shape of the `~orpc` definition attached to every contract procedure.
 * We only read the two fields the MCP tool surface needs: the Zod input
 * schema and the optional `route.description` (the latter becomes the
 * tool's human-readable description).
 */
export interface OrpcProcedureDef {
  inputSchema?: AnySchema;
  route?: { description?: string };
}

/* oxlint-disable no-unsafe-type-assertion -- dynamic oRPC contract/client traversal requires type assertions */

/**
 * Extract the `~orpc` definition object from a contract procedure. oRPC
 * hides the def under that sentinel key on every built procedure.
 */
export const getOrpcDef = (contract: unknown): OrpcProcedureDef => {
  const proc = contract as Record<string, unknown>;
  return (proc["~orpc"] ?? {}) as OrpcProcedureDef;
};

/**
 * Walk the router tree by path to find the leaf procedure. The router is
 * a plain nested object whose leaves are oRPC procedures — this is a
 * straight property walk, mirroring how `call(queuesRouter.list, ...)`
 * works in the existing test harness.
 */
export const resolveProcedure = (
  router: AnyRouter,
  path: readonly string[]
): unknown => {
  let node: unknown = router;
  for (const key of path) {
    node = (node as Record<string, unknown>)[key];
  }
  return node;
};

/**
 * Same idea, but for the oRPC client: walk the nested client object to
 * reach the leaf method. Used in stdio mode where dispatch goes over
 * RPCLink instead of running procedures in-process.
 */
export const resolveClientFn = (
  client: RouterClient<AnyRouter>,
  path: readonly string[]
): ((input: unknown) => Promise<unknown>) => {
  let current: unknown = client;
  for (const key of path) {
    current = (current as Record<string, unknown>)[key];
  }
  return current as (input: unknown) => Promise<unknown>;
};

/* oxlint-enable no-unsafe-type-assertion */
