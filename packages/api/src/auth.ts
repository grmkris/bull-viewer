import type { Scope, Viewer } from "@bull-viewer/core"

export type AuthorizeResult =
  | {
      ok: true
      viewer: Viewer | null
      scopes?: Scope[]
    }
  | {
      ok: false
      status?: number
      message?: string
    }

export type Authorize = (req: Request) => Promise<AuthorizeResult>

export const ALLOW_ALL: Authorize = async () => ({
  ok: true,
  viewer: null,
})
