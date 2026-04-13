import { readMetrics } from "@bull-viewer/core/server"
import type { ReadMetricsOptions } from "@bull-viewer/core/server"
import { json } from "../handler.ts"
import type { RouteHandler } from "../routes.ts"

const VALID_RANGES = new Set(["15m", "1h", "6h", "24h", "7d"])

export const metricsHandler: RouteHandler = async (_req, ctx) => {
  const queue = ctx.registry.getQueue(ctx.params.name!)
  if (!queue) return json({ error: "queue not found" }, 404)

  const range = ctx.url.searchParams.get("range") ?? "1h"
  if (!VALID_RANGES.has(range)) {
    return json({ error: `invalid range: ${range}` }, 400)
  }

  const data = await readMetrics(
    ctx.registry.connection,
    ctx.params.name!,
    { range: range as ReadMetricsOptions["range"] },
  )
  return json(data)
}
