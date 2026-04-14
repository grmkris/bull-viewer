# @grmkris/bull-viewer-next

## 0.2.0

### Minor Changes

- [`bf6e8cc`](https://github.com/grmkris/bull-viewer/commit/bf6e8ccbeb9afb37774a84a498db51fd0ba59d39) Thanks [@grmkris](https://github.com/grmkris)! - Next adapter now mounts the MCP Streamable HTTP endpoint by default. Host apps embedding via `createQueuesRouteHandlers` get `${basePath}/tenants/:id/mcp` (and the legacy `${basePath}/mcp` alias) for free — AI agents (Claude Code CLI, Cursor, etc.) can connect to the same endpoint they'd use against the standalone server. The MCP handler reuses the existing `authorize` guard and scope middleware, so tool calls are governed by the exact same permissions as the dashboard UI.

  Opt out with `mcp: false` in `CreateQueuesRouteHandlersOptions`.

### Patch Changes

- Updated dependencies [[`8da78e8`](https://github.com/grmkris/bull-viewer/commit/8da78e89b64cbfeca03a71a728cbe2294a584e7c)]:
  - @grmkris/bull-viewer-mcp@0.2.0
  - @grmkris/bull-viewer-api@0.2.0
  - @grmkris/bull-viewer-ui@0.2.0
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
  - @grmkris/bull-viewer-api@0.2.0
  - @grmkris/bull-viewer-ui@0.2.0
