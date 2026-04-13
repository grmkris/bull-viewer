import type { Authorize } from "@bull-viewer/api"
import { ALL_SCOPES } from "@bull-viewer/core"

export type AuthMode = "none" | "basic" | "bearer"

export interface AuthConfig {
  mode: AuthMode
  user?: string
  pass?: string
  tokens?: string[]
}

export function createAuthorize(config: AuthConfig): Authorize {
  if (config.mode === "none") {
    console.warn(
      "[bull-viewer] BULL_VIEWER_AUTH_MODE=none — anyone with network access can mutate queues",
    )
    return async () => ({
      ok: true,
      viewer: null,
      scopes: [...ALL_SCOPES],
    })
  }

  if (config.mode === "basic") {
    if (!config.user || !config.pass) {
      throw new Error(
        "BULL_VIEWER_AUTH_MODE=basic requires BULL_VIEWER_AUTH_USER and BULL_VIEWER_AUTH_PASS",
      )
    }
    const expected = "Basic " + btoa(`${config.user}:${config.pass}`)
    return async (req) => {
      const header = req.headers.get("authorization")
      if (header !== expected) {
        return {
          ok: false,
          status: 401,
          message: "invalid credentials",
        }
      }
      return {
        ok: true,
        viewer: { id: config.user!, name: config.user! },
        scopes: [...ALL_SCOPES],
      }
    }
  }

  if (config.mode === "bearer") {
    const tokens = new Set(config.tokens ?? [])
    if (tokens.size === 0) {
      throw new Error(
        "BULL_VIEWER_AUTH_MODE=bearer requires BULL_VIEWER_AUTH_TOKENS",
      )
    }
    return async (req) => {
      const header = req.headers.get("authorization")
      if (!header?.startsWith("Bearer ")) {
        return { ok: false, status: 401, message: "missing bearer token" }
      }
      const token = header.slice(7)
      if (!tokens.has(token)) {
        return { ok: false, status: 401, message: "invalid token" }
      }
      return {
        ok: true,
        viewer: { id: "token-user" },
        scopes: [...ALL_SCOPES],
      }
    }
  }

  throw new Error(`unknown auth mode: ${config.mode}`)
}
