import { getJob } from "@bull-viewer/core/server"
import { json } from "../handler.ts"
import type { RouteHandler } from "../routes.ts"

export const getJobHandler: RouteHandler = async (_req, ctx) => {
  const queue = ctx.registry.getQueue(ctx.params.name!)
  if (!queue) return json({ error: "queue not found" }, 404)

  const job = await getJob(queue, ctx.params.id!)
  if (!job) return json({ error: "job not found" }, 404)
  return json({ job })
}
