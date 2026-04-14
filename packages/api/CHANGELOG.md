# @grmkris/bull-viewer-api

## 0.2.0

### Minor Changes

- [`8da78e8`](https://github.com/grmkris/bull-viewer/commit/8da78e89b64cbfeca03a71a728cbe2294a584e7c) Thanks [@grmkris](https://github.com/grmkris)! - New package `@grmkris/bull-viewer-mcp`: Model Context Protocol server that turns the bull-viewer oRPC router into MCP tools for AI agents (Claude Desktop, Claude Code CLI, Cursor, any MCP client). Two transports:
  - **HTTP Streamable** — mounted automatically inside `@grmkris/bull-viewer-standalone` at `/api/tenants/:id/mcp` (and the legacy `/api/mcp` alias). Uses the existing tenant + auth + scope middleware so every MCP tool call is governed by the same `authorize` + scope checks as the dashboard UI.
  - **Stdio subprocess** — `npx @grmkris/bull-viewer-mcp` boots a stdio MCP server that proxies tool calls over RPCLink to a remote bull-viewer. Configure with `BULL_VIEWER_URL`, `BULL_VIEWER_TENANT`, and (optional) `BULL_VIEWER_TOKEN` env vars.

  Tools are generated from the oRPC router contract at runtime — no hand-written tool definitions, every procedure (`queues.*`, `jobs.*`, `metrics.*`, `search.*`, `me`) becomes an MCP tool with its Zod schema and description preserved.

  `@grmkris/bull-viewer-api` gains a new optional `mcpHandler` field on `CreateQueuesApiHandlerOptions` plus an exported `McpRequestHandler` type so host apps compose the two without a circular workspace dependency.

### Patch Changes

- Updated dependencies []:
  - @grmkris/bull-viewer-core@0.2.0

## 0.1.0

### Minor Changes

- [`731c00d`](https://github.com/grmkris/bull-viewer/commit/731c00d7ac8e9f15a97c59ae77494cba73819d80) Thanks [@grmkris](https://github.com/grmkris)! - Initial public release.

  Modern BullMQ dashboard with oRPC end-to-end types, React 19, TanStack
  Router/Query/Virtual, Tailwind v4, multi-tenant support, live tail via SSE,
  flow visualization, payload viewer, and tier 0/1/2 search. Ships as a Next.js
  embed library, a Hono standalone server, and a Docker image.

### Patch Changes

- Updated dependencies [[`731c00d`](https://github.com/grmkris/bull-viewer/commit/731c00d7ac8e9f15a97c59ae77494cba73819d80)]:
  - @grmkris/bull-viewer-core@0.2.0
