# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.1.0] — 2026-04-14

Initial public release.

### Added

- **Standalone Docker image** (`grmkris/bull-viewer`) — Hono server fronting
  one or more BullMQ Redis instances, fully self-contained.
- **Next.js embed** (`@grmkris/bull-viewer-next`) — drop-in page + route
  handlers for embedding the dashboard inside a host Next app, sharing its
  auth and session.
- **oRPC API** (`@grmkris/bull-viewer-api`) — typed router with end-to-end
  type safety, request-scoped logger, typed `commonErrors` map, tiered base
  procedures with input-driven `queueProcedure` middleware.
- **Multi-tenant** — one dashboard can front several Redis targets; tenant id
  scopes the registry, the SSE channel, and the UI tenant switcher.
- **Live tail** via Server-Sent Events (BullMQ `QueueEvents` per tenant).
- **Job payload viewer** — CodeMirror 6 with JSON folding, lazy-loaded.
- **Flow visualization** — `xyflow/react` + `dagre` parent/child rendering.
- **Cmd-K search** — Tier 0 (id), Tier 1 (name), Tier 2 (full payload via
  pluggable `SearchProvider`).
- **RBAC scopes** — `read`, `retry`, `remove`, `pause`, `promote`. Default
  is read-only when `authorize` omits the scopes array.
- **Bundle budgets** — base ≤ 220 KB gz, JsonViewer ≤ 200 KB, FlowGraph
  ≤ 110 KB, QueueOverview ≤ 60 KB. Enforced in CI.
- **Procedure tests** — 13 `bun test` cases covering scope checks, readOnly
  enforcement, and happy-path snapshot returns. Direct `call(procedure,
input, { context })` against fake registries — no Docker required.
