import { getQueueSnapshot } from "@bull-viewer/core/server"
import { json } from "../handler.ts"
import type { RouteHandler } from "../routes.ts"

export const getQueueDetail: RouteHandler = async (_req, ctx) => {
  const queue = ctx.registry.getQueue(ctx.params.name!)
  if (!queue) return json({ error: "queue not found" }, 404)
  const snapshot = await getQueueSnapshot(queue)
  return json({ queue: snapshot })
}
