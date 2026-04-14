# Contributing

Thanks for your interest in `bull-viewer`. This is currently a small,
opinionated project — issues and small PRs are welcome; large refactors are
worth discussing in an issue first.

## Setup

```sh
bun install
bun --filter '*' typecheck
bun --filter @grmkris/bull-viewer-api test
bun --filter @grmkris/bull-viewer-ui build      # also runs the bundle guard
```

You'll need a local Redis on `localhost:6379` for the standalone smoke. Seed
it with the example seeder:

```sh
bun seed
```

Then in two terminals:

```sh
bun dev:standalone     # http://localhost:3000
bun dev:next-embed     # http://localhost:3001/admin/queues
```

## Workspace layout

```
packages/
  core/         BullMQ adapter, registry, types
  api/          oRPC routers + middleware
  ui/           React app + library bundle
  standalone/   Hono server (Docker target)
  next/         Next.js page + route handlers
examples/
  next-embed/   reference Next host
  seed-bullmq/  seeds emails + reports queues
```

## Code style

- TypeScript strict, ESM only.
- Lint + format via `ultracite` (oxlint + oxfmt). Run `bun fix` before
  committing — CI is strict.
- No comments unless the _why_ is non-obvious.
- Bundle budgets are load-bearing; new dependencies go through
  `scripts/bundle-guard.ts`.

## Tests

`@grmkris/bull-viewer-api` has direct procedure tests under `packages/api/test/`
that use `bun test` — no HTTP, no Docker, no mocked fetch. Add a test next to
any new router handler. See `packages/api/test/queues.test.ts` for the shape.

## Releases

Releases are managed via [Changesets](https://github.com/changesets/changesets).
Add one with `bunx changeset` describing your change; it gets bundled into the
next release on push to `main`.
