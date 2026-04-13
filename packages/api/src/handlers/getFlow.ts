import { findFlowRoot, getFlow } from "@bull-viewer/core/server"
import { json } from "../handler.ts"
import type { RouteHandler } from "../routes.ts"

export const getFlowHandler: RouteHandler = async (_req, ctx) => {
  const queue = ctx.registry.getQueue(ctx.params.name!)
  if (!queue) return json({ error: "queue not found" }, 404)

  const id = ctx.params.id!
  // Resolve the flow root from any node id (walks up via parentKey)
  const rootId = (await findFlowRoot(queue, id)) ?? id
  const flow = await getFlow(queue, rootId)
  if (!flow) return json({ error: "flow not found" }, 404)
  return json(flow)
}
