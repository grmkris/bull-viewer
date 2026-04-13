import type { Scope, Viewer } from "@bull-viewer/core"
import type { QueueRegistry } from "@bull-viewer/core/server"

export interface RouteContext {
  registry: QueueRegistry
  params: Record<string, string>
  url: URL
  viewer: Viewer | null
  scopes: Set<Scope>
}

export type RouteHandler = (
  req: Request,
  ctx: RouteContext,
) => Promise<Response> | Response

export interface Route {
  method: "GET" | "POST" | "PATCH" | "DELETE"
  path: string
  requiredScope?: Scope
  handler: RouteHandler
}

import { listQueues } from "./handlers/listQueues.ts"
import { getQueueDetail } from "./handlers/getQueue.ts"
import { listJobsHandler } from "./handlers/listJobs.ts"
import { getJobHandler } from "./handlers/getJob.ts"
import { meHandler } from "./handlers/me.ts"
import { jobActionHandler } from "./handlers/jobAction.ts"
import { bulkActionHandler } from "./handlers/bulkAction.ts"
import { eventsHandler } from "./handlers/events.ts"
import { metricsHandler } from "./handlers/getMetrics.ts"

export const routes: Route[] = [
  { method: "GET", path: "/me", handler: meHandler },
  { method: "GET", path: "/queues", handler: listQueues, requiredScope: "read" },
  {
    method: "GET",
    path: "/queues/:name",
    handler: getQueueDetail,
    requiredScope: "read",
  },
  {
    method: "GET",
    path: "/queues/:name/jobs",
    handler: listJobsHandler,
    requiredScope: "read",
  },
  {
    method: "GET",
    path: "/queues/:name/jobs/:id",
    handler: getJobHandler,
    requiredScope: "read",
  },
  {
    method: "POST",
    path: "/queues/:name/jobs/:id/:action",
    handler: jobActionHandler,
  },
  {
    method: "POST",
    path: "/queues/:name/jobs/bulk",
    handler: bulkActionHandler,
  },
  {
    method: "GET",
    path: "/queues/:name/events",
    handler: eventsHandler,
    requiredScope: "read",
  },
  {
    method: "GET",
    path: "/queues/:name/metrics",
    handler: metricsHandler,
    requiredScope: "read",
  },
]
