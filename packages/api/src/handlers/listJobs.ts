import { listJobs } from "@bull-viewer/core/server"
import type { JobState } from "@bull-viewer/core"
import { json } from "../handler.ts"
import type { RouteHandler } from "../routes.ts"

const VALID_STATES = new Set<JobState>([
  "waiting",
  "active",
  "completed",
  "failed",
  "delayed",
  "paused",
  "waiting-children",
  "prioritized",
])

export const listJobsHandler: RouteHandler = async (_req, ctx) => {
  const queue = ctx.registry.getQueue(ctx.params.name!)
  if (!queue) return json({ error: "queue not found" }, 404)

  const stateParam = (ctx.url.searchParams.get("state") ?? "waiting") as JobState
  if (!VALID_STATES.has(stateParam)) {
    return json({ error: `invalid state: ${stateParam}` }, 400)
  }

  const start = Number(ctx.url.searchParams.get("start") ?? "0")
  const end = Number(ctx.url.searchParams.get("end") ?? "19")

  const page = await listJobs(queue, stateParam, start, end)
  return json(page)
}
