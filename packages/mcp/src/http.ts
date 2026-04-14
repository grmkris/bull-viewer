import type { ViewerContext } from "@grmkris/bull-viewer-api";
import { appRouter } from "@grmkris/bull-viewer-api";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import { createInProcessDispatch } from "./dispatch.ts";
import { VERSION } from "./version.ts";
import { registerOrpcTools } from "./walker.ts";

const DEFAULT_INCLUDE = ["queues", "jobs", "metrics", "search", "me"] as const;

/**
 * Options for `createBullViewerMcpHandler`. Every field is optional —
 * defaults match what a self-hosted bull-viewer standalone server wants.
 */
export interface CreateMcpHandlerOptions {
  /**
   * Top-level router namespaces to expose as tools. Defaults to
   * `["queues", "jobs", "metrics", "search", "me"]` — every currently
   * shipped namespace except the streaming SSE endpoint (which is not an
   * oRPC procedure and is handled separately by the API handler).
   */
  includePrefixes?: readonly string[];
  /** Dot-paths to skip. Useful for narrowing the exposed surface. */
  exclude?: readonly string[];
  /** Override tool descriptions by generated tool name. */
  descriptions?: Record<string, string>;
  /**
   * Override the MCP server's advertised name + version in the
   * `initialize` handshake. Defaults to `{ name: "bull-viewer", version }`.
   */
  serverInfo?: { name: string; version: string };
}

/**
 * A request handler that maps a raw `Request` + the already-built
 * `ViewerContext` (from the API dispatcher) onto an MCP `Response`.
 * Intended to be called from inside `createQueuesApiHandler` after the
 * tenant has been resolved and auth/scope checks have run.
 */
export type McpRequestHandler = (
  req: Request,
  context: ViewerContext
) => Promise<Response>;

/**
 * Create a stateless MCP handler that turns the bull-viewer oRPC router
 * into MCP tools. Each incoming request builds a fresh `McpServer` + a
 * fresh `WebStandardStreamableHTTPServerTransport`, registers tools, and
 * dispatches via `call()` using the `ViewerContext` the caller built —
 * so the full middleware chain (auth, scope, readOnly) still governs
 * every tool invocation without any duplication in this layer.
 *
 * Matches invok's `handleMcpRequest` pattern one-for-one. See
 * `/apps/admin-api/src/routes/mcp-remote.ts` in the invok repo.
 */
export const createBullViewerMcpHandler = (
  opts: CreateMcpHandlerOptions = {}
): McpRequestHandler => {
  const includePrefixes = opts.includePrefixes ?? DEFAULT_INCLUDE;
  const serverInfo = opts.serverInfo ?? {
    name: "bull-viewer",
    version: VERSION,
  };

  return async (req, context) => {
    const server = new McpServer(serverInfo);

    registerOrpcTools({
      server,
      router: appRouter,
      dispatch: createInProcessDispatch(
        appRouter,
        context as unknown as Record<string, unknown>
      ),
      includePrefixes,
      exclude: opts.exclude,
      descriptions: opts.descriptions,
    });

    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await server.connect(transport);
    return transport.handleRequest(req);
  };
};
