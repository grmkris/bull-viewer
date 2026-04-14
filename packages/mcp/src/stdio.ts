import { appRouter, type AppRouter } from "@grmkris/bull-viewer-api";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";

import { createClientDispatch } from "./dispatch.ts";
import { VERSION } from "./version.ts";
import { registerOrpcTools } from "./walker.ts";

export interface RunStdioServerOptions {
  /**
   * Base URL of the running bull-viewer instance — for example
   * `http://localhost:4747/api`. The trailing `/tenants/<id>/rpc` segment
   * is appended automatically; do not include it.
   */
  url: string;
  /**
   * Tenant id to talk to. Defaults to `"default"`, which matches the
   * synthesized id used in legacy single-tenant deployments.
   */
  tenant?: string;
  /**
   * Optional Bearer token sent on every oRPC call. Required when the
   * remote bull-viewer enables `BULL_VIEWER_AUTH_MODE=bearer`.
   */
  token?: string;
  /**
   * Top-level router namespaces to expose. Defaults to every shipped one.
   */
  includePrefixes?: readonly string[];
}

const DEFAULT_INCLUDE = ["queues", "jobs", "metrics", "search", "me"] as const;

/**
 * Boot a stdio-transport MCP server that proxies tool calls back to a
 * remote bull-viewer over its oRPC HTTP endpoint. Intended for Claude
 * Desktop / agent SDKs that spawn MCP servers as child processes.
 *
 * The router is imported only for contract introspection — actual
 * dispatch goes through `RPCLink` → `createORPCClient`. Mirrors invok's
 * `apps/invok-api/src/agent/mcp-server.ts` pattern.
 */
export const runStdioServer = async (
  options: RunStdioServerOptions
): Promise<void> => {
  const baseUrl = options.url.replace(/\/$/, "");
  const tenant = options.tenant ?? "default";

  const link = new RPCLink({
    url: `${baseUrl}/tenants/${tenant}/rpc`,
    headers: options.token ? { Authorization: `Bearer ${options.token}` } : {},
  });
  const client: RouterClient<AppRouter> = createORPCClient(link);

  const server = new McpServer({
    name: `bull-viewer (${tenant})`,
    version: VERSION,
  });

  registerOrpcTools({
    server,
    router: appRouter,
    dispatch: createClientDispatch(client),
    includePrefixes: options.includePrefixes ?? DEFAULT_INCLUDE,
  });

  await server.connect(new StdioServerTransport());
};
