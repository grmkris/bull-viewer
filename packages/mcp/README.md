# @grmkris/bull-viewer-mcp

Model Context Protocol server for [bull-viewer](https://github.com/grmkris/bull-viewer). Turns every oRPC procedure into an MCP tool so AI agents can browse BullMQ queues, inspect jobs, retry failures, read metrics, and search — without you writing a single hand-rolled tool definition.

Tools are generated automatically from the router contract: `queues.list` becomes `queues_list`, `jobs.retry` becomes `jobs_retry`, every Zod input schema is preserved, and every `route.description` is surfaced as the tool description.

## Two transports

### HTTP Streamable (mounted inside the standalone server)

When you run `@grmkris/bull-viewer-standalone`, the MCP endpoint is automatically mounted at:

```
http://localhost:4747/api/tenants/<tenant-id>/mcp
http://localhost:4747/api/mcp                       # legacy single-tenant alias
```

Add it to Claude Code CLI:

```sh
claude mcp add bull-viewer --transport http --url http://localhost:4747/api/tenants/default/mcp
```

The endpoint runs through the same `authorize` guard and scope middleware as the rest of the API — set `BULL_VIEWER_AUTH_MODE=bearer` to require a Bearer token on every MCP call.

### Stdio subprocess (`npx @grmkris/bull-viewer-mcp`)

For Claude Desktop and other clients that spawn MCP servers as subprocesses:

```json
{
  "mcpServers": {
    "bull-viewer": {
      "command": "npx",
      "args": ["-y", "@grmkris/bull-viewer-mcp"],
      "env": {
        "BULL_VIEWER_URL": "http://localhost:4747/api",
        "BULL_VIEWER_TENANT": "default"
      }
    }
  }
}
```

| Env var              | Default                     | Description                                   |
| -------------------- | --------------------------- | --------------------------------------------- |
| `BULL_VIEWER_URL`    | `http://localhost:4747/api` | Base URL of the running bull-viewer instance. |
| `BULL_VIEWER_TENANT` | `default`                   | Tenant id to talk to.                         |
| `BULL_VIEWER_TOKEN`  | _(none)_                    | Bearer token, when the remote requires auth.  |

The stdio bin proxies every tool call back to the remote bull-viewer over its oRPC HTTP endpoint via `RPCLink`. The router is imported only for schema introspection.

## Programmatic use

```ts
import { createQueuesApiHandler } from "@grmkris/bull-viewer-api";
import { createBullViewerMcpHandler } from "@grmkris/bull-viewer-mcp";

const apiHandler = createQueuesApiHandler({
  tenants: { default: { registry } },
  defaultTenant: "default",
  basePath: "/api",
  mcpHandler: createBullViewerMcpHandler(),
});
```

`createBullViewerMcpHandler` accepts:

| Option            | Default                                           | Description                                                       |
| ----------------- | ------------------------------------------------- | ----------------------------------------------------------------- |
| `includePrefixes` | `["queues", "jobs", "metrics", "search", "me"]`   | Top-level router namespaces to expose as tools.                   |
| `exclude`         | `[]`                                              | Dot-paths (e.g. `"jobs.retry"`) to skip entirely.                 |
| `descriptions`    | `{}`                                              | Override tool descriptions by generated tool name.                |
| `serverInfo`      | `{ name: "bull-viewer", version: <pkg.version> }` | Override the MCP server's `initialize` advertised name + version. |

## How it works

A single ~80-line walker (`registerOrpcTools`) iterates the router contract via `traverseContractProcedures` from `@orpc/server`. For every leaf procedure it reads the `~orpc` definition, extracts the Zod input schema and description, and registers an MCP tool whose handler dispatches via a caller-provided `dispatch` callback.

Two dispatch implementations ship out of the box:

- **`createInProcessDispatch(router, context)`** uses `call(procedure, input, { context })` from `@orpc/server`. The full middleware chain (auth, scope, readOnly, typed errors) runs on every tool call, identical to an HTTP request — no logic duplication, no extra wiring. Used by the HTTP-mounted handler.
- **`createClientDispatch(client)`** forwards every tool call through a typed oRPC client (typically an `RPCLink` pointed at a remote bull-viewer). Used by the stdio bin.

The HTTP handler creates a fresh `McpServer` + `WebStandardStreamableHTTPServerTransport` per request in stateless mode (`sessionIdGenerator: undefined`). No session state, no leaks, perfect tenant isolation.

## Multi-tenant

Each tenant has its own MCP endpoint. Point one client at `/tenants/zednabi-prod/mcp` and another at `/tenants/ai-stilist/mcp` simultaneously — they share zero state, and the `ViewerContext` is rebuilt per request so cross-tenant leakage is impossible.

## License

MIT
