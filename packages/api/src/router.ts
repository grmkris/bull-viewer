import type { RouterClient } from "@orpc/server";

import { jobsRouter } from "./routers/jobs.ts";
import { meProcedure } from "./routers/me.ts";
import { metricsRouter } from "./routers/metrics.ts";
import { queuesRouter } from "./routers/queues.ts";
import { searchRouter } from "./routers/search.ts";

/**
 * Root oRPC router. Adding a new procedure means:
 *   1. Define it in a file under `./routers/`
 *   2. Wire it into a namespace object here
 * No URL table, no HTTP verb, no JSON (de)serialization boilerplate.
 */
export const appRouter = {
  me: meProcedure,
  queues: queuesRouter,
  jobs: jobsRouter,
  metrics: metricsRouter,
  search: searchRouter,
};

export type AppRouter = typeof appRouter;

/**
 * Pre-resolved client type — the UI imports this instead of touching
 * `RouterClient` + `AppRouter` directly, so the UI package doesn't need
 * `@orpc/server` as a dep.
 */
export type AppRouterClient = RouterClient<AppRouter>;
