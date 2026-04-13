import { RedisScanSearchProvider } from "@bull-viewer/core/server"
import type { SearchProvider } from "@bull-viewer/core/server"
import type { JobState } from "@bull-viewer/core"
import { json } from "../handler.ts"
import type { RouteHandler } from "../routes.ts"

let providerOverride: SearchProvider | undefined

/**
 * Hosts can inject a custom SearchProvider (Postgres / Meilisearch / Elastic).
 * Call once at startup before any requests.
 */
export function setSearchProvider(provider: SearchProvider): void {
  providerOverride = provider
}

export const searchHandler: RouteHandler = async (_req, ctx) => {
  const queue = ctx.registry.getQueue(ctx.params.name!)
  if (!queue) return json({ error: "queue not found" }, 404)

  const query = ctx.url.searchParams.get("q") ?? ""
  if (!query.trim()) {
    return json({ jobs: [], truncated: false, scanned: 0, durationMs: 0 })
  }
  const limit = Math.min(Number(ctx.url.searchParams.get("limit") ?? "20"), 100)
  const statesParam = ctx.url.searchParams.getAll("state")
  const states = statesParam.length ? (statesParam as JobState[]) : undefined

  const provider = providerOverride ?? RedisScanSearchProvider
  const result = await provider.search({ queue, query, states, limit })
  return json(result)
}
