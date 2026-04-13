import { promoteJob, removeJob, retryJob } from "@bull-viewer/core/server"
import type { Scope } from "@bull-viewer/core"
import { json } from "../handler.ts"
import type { RouteHandler } from "../routes.ts"

const ACTION_SCOPE: Record<string, Scope> = {
  retry: "retry",
  remove: "remove",
  promote: "promote",
}

export const jobActionHandler: RouteHandler = async (_req, ctx) => {
  const action = ctx.params.action!
  const required = ACTION_SCOPE[action]
  if (!required) return json({ error: `unknown action: ${action}` }, 400)
  if (!ctx.scopes.has(required)) {
    return json({ error: `insufficient scope: ${required}` }, 403)
  }

  const queue = ctx.registry.getQueue(ctx.params.name!)
  if (!queue) return json({ error: "queue not found" }, 404)

  const id = ctx.params.id!
  let result
  switch (action) {
    case "retry":
      result = await retryJob(queue, id)
      break
    case "remove":
      result = await removeJob(queue, id)
      break
    case "promote":
      result = await promoteJob(queue, id)
      break
  }

  if (!result || !result.ok) {
    return json({ error: result?.reason ?? "action failed" }, 400)
  }
  return json({ ok: true })
}
