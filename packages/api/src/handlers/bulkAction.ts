import { bulkAction } from "@bull-viewer/core/server"
import type { JobState, Scope } from "@bull-viewer/core"
import { json } from "../handler.ts"
import type { RouteHandler } from "../routes.ts"

const ACTION_SCOPE: Record<string, Scope> = {
  retry: "retry",
  remove: "remove",
  promote: "promote",
}

interface BulkBody {
  action?: "retry" | "remove" | "promote"
  ids?: string[]
  filter?: { states?: JobState[]; nameFilter?: string }
  cap?: number
}

export const bulkActionHandler: RouteHandler = async (req, ctx) => {
  const queue = ctx.registry.getQueue(ctx.params.name!)
  if (!queue) return json({ error: "queue not found" }, 404)

  let body: BulkBody
  try {
    body = (await req.json()) as BulkBody
  } catch {
    return json({ error: "invalid json body" }, 400)
  }

  if (!body.action || !ACTION_SCOPE[body.action]) {
    return json({ error: "missing or invalid action" }, 400)
  }
  const required = ACTION_SCOPE[body.action]!
  if (!ctx.scopes.has(required)) {
    return json({ error: `insufficient scope: ${required}` }, 403)
  }
  if (!body.ids?.length && !body.filter) {
    return json({ error: "must provide ids or filter" }, 400)
  }

  const result = await bulkAction(queue, {
    action: body.action,
    ids: body.ids,
    filter: body.filter
      ? {
          states: body.filter.states ?? [],
          nameFilter: body.filter.nameFilter,
        }
      : undefined,
    cap: body.cap,
  })

  return json(result, result.ok ? 200 : 207)
}
