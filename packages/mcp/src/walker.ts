import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AnySchema } from "@modelcontextprotocol/sdk/server/zod-compat.js";
import type { AnyRouter } from "@orpc/server";
import { traverseContractProcedures } from "@orpc/server";

import { getOrpcDef } from "./resolver.ts";

/**
 * Options for `registerOrpcTools`.
 *
 * The walker is transport-agnostic: it discovers procedures from the
 * router contract and registers one MCP tool per procedure. Dispatch is
 * abstracted via the `dispatch` callback so the same walker can be used
 * in-process (via `call()`) or over an oRPC client (via RPCLink).
 */
export interface WalkerOptions {
  /** Root oRPC router. Procedures are discovered by contract traversal. */
  router: AnyRouter;
  /** Target MCP server instance. Tools are registered onto it in place. */
  server: McpServer;
  /**
   * How to actually run a procedure once the MCP client calls the tool.
   * Receives the path array (e.g. `["queues", "list"]`) and the validated
   * input, and returns the procedure's result.
   */
  dispatch: (path: readonly string[], input: unknown) => Promise<unknown>;
  /**
   * Only register procedures whose *top-level* segment appears here. If
   * omitted, every top-level namespace is included.
   */
  includePrefixes?: readonly string[];
  /**
   * Dot-paths (e.g. `"events.subscribe"`) to skip entirely. Useful for
   * streaming or otherwise tool-incompatible procedures.
   */
  exclude?: readonly string[];
  /** Override tool descriptions by tool name (e.g. `"queues_list"`). */
  descriptions?: Record<string, string>;
  /**
   * Customize the generated tool name. Defaults to `path.join("_")`, which
   * matches invok's convention and keeps names valid across every MCP
   * client we care about.
   */
  nameFor?: (path: readonly string[]) => string;
}

/**
 * Walk the router contract, register one MCP tool per procedure on the
 * given server, and return the list of registered tool names for logging
 * and testing purposes.
 *
 * Adapted from invok's `orpc-to-mcp.ts` — see
 * `/apps/invok-api/src/agent/orpc-to-mcp.ts` in the invok repo for the
 * reference implementation.
 */
export const registerOrpcTools = (opts: WalkerOptions): string[] => {
  const registered: string[] = [];
  const nameFor = opts.nameFor ?? ((p) => p.join("_"));
  const include = opts.includePrefixes ? new Set(opts.includePrefixes) : null;
  const exclude = new Set(opts.exclude ?? []);

  traverseContractProcedures(
    { path: [], router: opts.router },
    ({ contract, path }) => {
      const [prefix] = path;
      if (prefix === undefined) return;
      if (include && !include.has(prefix)) return;

      const dotPath = path.join(".");
      if (exclude.has(dotPath)) return;

      const def = getOrpcDef(contract);
      const toolName = nameFor(path);
      const description =
        opts.descriptions?.[toolName] ??
        def.route?.description ??
        `${dotPath} — bull-viewer procedure`;

      opts.server.registerTool(
        toolName,
        {
          description,
          ...(def.inputSchema
            ? { inputSchema: def.inputSchema as AnySchema }
            : {}),
        },
        async (args: unknown) => {
          try {
            const result = await opts.dispatch(path, args ?? {});
            return {
              content: [
                {
                  text: JSON.stringify(result, null, 2),
                  type: "text" as const,
                },
              ],
            };
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error);
            return {
              content: [
                {
                  text: `Error: ${message}`,
                  type: "text" as const,
                },
              ],
              isError: true,
            };
          }
        }
      );
      registered.push(toolName);
    }
  );

  return registered;
};
