---
"@grmkris/bull-viewer-next": minor
---

Next adapter now mounts the MCP Streamable HTTP endpoint by default. Host apps embedding via `createQueuesRouteHandlers` get `${basePath}/tenants/:id/mcp` (and the legacy `${basePath}/mcp` alias) for free — AI agents (Claude Code CLI, Cursor, etc.) can connect to the same endpoint they'd use against the standalone server. The MCP handler reuses the existing `authorize` guard and scope middleware, so tool calls are governed by the exact same permissions as the dashboard UI.

Opt out with `mcp: false` in `CreateQueuesRouteHandlersOptions`.
