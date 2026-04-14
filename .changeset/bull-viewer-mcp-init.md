---
"@grmkris/bull-viewer-mcp": minor
"@grmkris/bull-viewer-api": minor
"@grmkris/bull-viewer-standalone": minor
---

New package `@grmkris/bull-viewer-mcp`: Model Context Protocol server that turns the bull-viewer oRPC router into MCP tools for AI agents (Claude Desktop, Claude Code CLI, Cursor, any MCP client). Two transports:

- **HTTP Streamable** — mounted automatically inside `@grmkris/bull-viewer-standalone` at `/api/tenants/:id/mcp` (and the legacy `/api/mcp` alias). Uses the existing tenant + auth + scope middleware so every MCP tool call is governed by the same `authorize` + scope checks as the dashboard UI.
- **Stdio subprocess** — `npx @grmkris/bull-viewer-mcp` boots a stdio MCP server that proxies tool calls over RPCLink to a remote bull-viewer. Configure with `BULL_VIEWER_URL`, `BULL_VIEWER_TENANT`, and (optional) `BULL_VIEWER_TOKEN` env vars.

Tools are generated from the oRPC router contract at runtime — no hand-written tool definitions, every procedure (`queues.*`, `jobs.*`, `metrics.*`, `search.*`, `me`) becomes an MCP tool with its Zod schema and description preserved.

`@grmkris/bull-viewer-api` gains a new optional `mcpHandler` field on `CreateQueuesApiHandlerOptions` plus an exported `McpRequestHandler` type so host apps compose the two without a circular workspace dependency.
