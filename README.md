# bull-viewer

A modern dashboard for [BullMQ](https://docs.bullmq.io/), built with oRPC,
React 19, TanStack Router/Query/Virtual, and Tailwind v4.

Runs as either a standalone Docker container against an existing Redis, or as
an embedded route inside your Next.js app — same UI, same RBAC, your auth.

```
┌───────────────────────────────────────────────────────────┐
│  queues        emails  ▒▒▒▒▒▒▒▒▒▒░░░  142 / 12 / 3 / 0    │
│   ▸ emails     reports ▒▒▒░░░░░░░░░░    8 / 0  / 0 / 0    │
│   ▸ reports                                                │
│                                                            │
│  jobs · failed                                             │
│   #481  send-welcome   12s    1   42ms   ✗ ECONNRESET      │
│   #480  send-welcome   1m     1   38ms   ✗ ECONNRESET      │
│   #478  weekly-digest  3m     2   1.2s   ✓                 │
│                                                            │
│  ⌘k search · j/k navigate · x select · enter open          │
└───────────────────────────────────────────────────────────┘
```

## Why another BullMQ dashboard

| | bull-board | bull-viewer |
|---|---|---|
| Live tail (SSE) | manual refresh | yes |
| Embed in Next.js with host auth | partial | first-class |
| Multi-tenant (one UI, many Redis) | no | yes |
| Job payload viewer | text | CodeMirror + JSON tree |
| Flow visualization | no | yes (xyflow) |
| Full-text search across jobs | no | tier 0/1/2 (id, name, payload) |
| RBAC scopes | basic | typed scopes per action |
| Bundle (gz) | ~360 KB | 205 KB base + lazy chunks |

## Quick start — Docker

```sh
docker run --rm -p 3000:3000 \
  -e REDIS_URL=redis://host.docker.internal:6379 \
  -e BULL_VIEWER_QUEUES=emails,reports \
  grmkris/bull-viewer:latest
```

Open <http://localhost:3000>.

For multi-tenant (one dashboard, multiple Redis instances):

```sh
docker run --rm -p 3000:3000 \
  -e BULL_VIEWER_TENANTS_JSON='[
    {"id":"prod","label":"Production","redis":"redis://prod:6379","queues":["emails","reports"]},
    {"id":"staging","label":"Staging","redis":"redis://staging:6379","queues":["emails"]}
  ]' \
  grmkris/bull-viewer:latest
```

A worked-out compose example lives in
[`examples/standalone-docker/`](examples/standalone-docker/).

## Quick start — Next.js embed

Install:

```sh
bun add @grmkris/bull-viewer-next @grmkris/bull-viewer-ui
```

Mount at `app/admin/queues/[[...segments]]/page.tsx`:

```tsx
import { BullViewerPage } from "@grmkris/bull-viewer-next";

export default function Page() {
  return (
    <BullViewerPage
      basePath="/admin/queues"
      apiBase="/admin/queues/api"
      scopes={["read", "retry"]}
    />
  );
}
```

Mount the API at `app/admin/queues/api/[...slug]/route.ts`:

```ts
import { createQueuesRouteHandlers } from "@grmkris/bull-viewer-next";
import IORedis from "ioredis";

const handler = createQueuesRouteHandlers({
  basePath: "/admin/queues",
  connection: new IORedis(process.env.REDIS_URL!),
  queues: ["emails", "reports"],
  authorize: async (req) => {
    const session = await getSession(req);
    if (!session) return { ok: false };
    return { ok: true, viewer: session.user, scopes: ["read", "retry"] };
  },
});

export const { GET, POST, PATCH, DELETE } = handler;
```

Import the styles once at your layout:

```ts
import "@grmkris/bull-viewer-ui/styles.css";
```

## Scopes (RBAC)

| scope | enables |
|---|---|
| `read` | view queues, jobs, payloads, metrics |
| `retry` | re-enqueue failed jobs |
| `remove` | delete jobs |
| `pause` | pause / resume queues |
| `promote` | promote delayed jobs |

Return the scopes array from your `authorize` callback per request. If you
omit `scopes`, the viewer is treated as **read-only** by default.

## Architecture

```
┌──── browser ────┐    ┌──── server ────┐    ┌── Redis ──┐
│  React 19       │    │ oRPC router     │    │  BullMQ   │
│  TanStack Q+R   │◄──►│ Hono / Next     │◄──►│           │
│  CodeMirror     │RPC │ ioredis pool    │    └───────────┘
│  xyflow         │    │ SSE live tail   │
└─────────────────┘    └─────────────────┘
```

Five workspace packages:

| package | role |
|---|---|
| `@grmkris/bull-viewer-core` | BullMQ adapter, registry, snapshot helpers |
| `@grmkris/bull-viewer-api` | oRPC routers, scope middleware, typed errors |
| `@grmkris/bull-viewer-ui` | React app, embed entry, library bundle |
| `@grmkris/bull-viewer-standalone` | Hono server (Docker target) |
| `@grmkris/bull-viewer-next` | Next.js page + route helpers |

## Roadmap

Tracked in `~/.claude/plans/` (private) — public milestones:

- v0.1 (this release) — embed + standalone, oRPC, scopes, multi-tenant
- v0.2 — worker view, queue logs, OpenTelemetry tracing
- v0.3 — alerts, audit log, scheduled jobs UI

## Development

```sh
bun install
bun --filter '*' typecheck
bun --filter @grmkris/bull-viewer-api test
bun --filter @grmkris/bull-viewer-ui build
bun dev:standalone   # boots on :3000
bun dev:next-embed   # boots on :3001
```

See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## License

MIT © 2026 Kristjan Grm. See [`LICENSE`](LICENSE).
