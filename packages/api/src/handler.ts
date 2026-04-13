import type { Scope } from "@bull-viewer/core"
import { ALL_SCOPES } from "@bull-viewer/core"
import type { QueueRegistry } from "@bull-viewer/core/server"
import type { Authorize } from "./auth.ts"
import { ALLOW_ALL } from "./auth.ts"
import type { Route, RouteContext } from "./routes.ts"
import { routes } from "./routes.ts"

export interface CreateHandlerOptions {
  registry: QueueRegistry
  authorize?: Authorize
  readOnly?: boolean
  basePath?: string
}

const MUTATING: Set<Route["method"]> = new Set(["POST", "PATCH", "DELETE"])

export function createHandler(
  options: CreateHandlerOptions,
): (req: Request) => Promise<Response> {
  const authorize = options.authorize ?? ALLOW_ALL
  const basePath = trimTrailingSlash(options.basePath ?? "")

  return async (req) => {
    const url = new URL(req.url)
    let pathname = url.pathname
    if (basePath && pathname.startsWith(basePath)) {
      pathname = pathname.slice(basePath.length) || "/"
    }
    if (!pathname.startsWith("/")) pathname = "/" + pathname

    const matched = matchRoute(req.method, pathname)
    if (!matched) return json({ error: "not found" }, 404)

    const verdict = await authorize(req)
    if (!verdict.ok) {
      return json(
        { error: verdict.message ?? "unauthorized" },
        verdict.status ?? 401,
      )
    }

    const scopes = new Set<Scope>(verdict.scopes ?? ALL_SCOPES)

    if (
      options.readOnly &&
      MUTATING.has(matched.route.method as Route["method"])
    ) {
      return json({ error: "read-only mode" }, 403)
    }

    if (matched.route.requiredScope && !scopes.has(matched.route.requiredScope)) {
      return json({ error: "insufficient scope" }, 403)
    }

    const ctx: RouteContext = {
      registry: options.registry,
      params: matched.params,
      url,
      viewer: verdict.viewer ?? null,
      scopes,
    }

    try {
      return await matched.route.handler(req, ctx)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return json({ error: message }, 500)
    }
  }
}

interface MatchedRoute {
  route: Route
  params: Record<string, string>
}

function matchRoute(method: string, pathname: string): MatchedRoute | null {
  for (const route of routes) {
    if (route.method !== method) continue
    const params = matchPath(route.path, pathname)
    if (params) return { route, params }
  }
  return null
}

function matchPath(
  pattern: string,
  pathname: string,
): Record<string, string> | null {
  const patternParts = pattern.split("/").filter(Boolean)
  const pathParts = pathname.split("/").filter(Boolean)
  if (patternParts.length !== pathParts.length) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < patternParts.length; i++) {
    const p = patternParts[i]!
    const v = pathParts[i]!
    if (p.startsWith(":")) {
      params[p.slice(1)] = decodeURIComponent(v)
    } else if (p !== v) {
      return null
    }
  }
  return params
}

function trimTrailingSlash(s: string): string {
  return s.endsWith("/") ? s.slice(0, -1) : s
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}
