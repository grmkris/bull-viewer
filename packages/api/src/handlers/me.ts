import { json } from "../handler.ts"
import type { RouteHandler } from "../routes.ts"

export const meHandler: RouteHandler = (_req, ctx) => {
  return json({
    viewer: ctx.viewer,
    scopes: [...ctx.scopes],
  })
}
