import { getQueueSnapshot } from "@bull-viewer/core/server"
import { json } from "../handler.ts"
import type { RouteHandler } from "../routes.ts"

export const listQueues: RouteHandler = async (_req, ctx) => {
  const names = ctx.registry.listQueueNames()
  const snapshots = await Promise.all(
    names.map(async (name) => {
      const queue = ctx.registry.getQueue(name)
      if (!queue) return null
      return await getQueueSnapshot(queue)
    }),
  )
  return json({ queues: snapshots.filter((s) => s !== null) })
}
