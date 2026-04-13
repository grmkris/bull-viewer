import type { Scope, Viewer } from "@bull-viewer/core";
import { READ_ONLY_SCOPES } from "@bull-viewer/core";
import type { QueueRegistry, SearchProvider } from "@bull-viewer/core/server";

export type AuthorizeResult =
  | {
      ok: true;
      viewer?: Viewer | null;
      scopes?: Scope[];
    }
  | {
      ok: false;
      status?: number;
      message?: string;
    };

export type Authorize = (req: Request) => Promise<AuthorizeResult>;

export const ALLOW_ALL: Authorize = async () => ({
  ok: true,
  viewer: null,
  // NOTE: omitting `scopes` here means `buildContext` falls back to
  // READ_ONLY_SCOPES — callers who want write access must opt in explicitly.
});

export interface ViewerContext {
  registry: QueueRegistry;
  viewer: Viewer | null;
  scopes: Set<Scope>;
  readOnly: boolean;
  headers: Headers;
  requestId: string;
  /**
   * Optional SearchProvider override injected at handler-creation time.
   * Defaults to `RedisScanSearchProvider` when unset. Lives on the context
   * (not module state) to avoid the dual-package hazard the old
   * `setSearchProvider` module-level setter had.
   */
  searchProvider?: SearchProvider;
}

export interface BuildContextOptions {
  registry: QueueRegistry;
  authorize?: Authorize;
  readOnly?: boolean;
  searchProvider?: SearchProvider;
}

/**
 * Resolve a ViewerContext from an incoming Request. Returns a Response on
 * auth failure so the caller can short-circuit before dispatching to oRPC.
 *
 * When `authorize` returns `ok: true` without an explicit `scopes` array,
 * we grant `READ_ONLY_SCOPES` (just `read`) — not the full `ALL_SCOPES`.
 * This is the intentional fail-closed default so a forgetful `Authorize`
 * implementation can't accidentally hand out destructive permissions.
 */
export async function buildContext(
  req: Request,
  options: BuildContextOptions,
): Promise<ViewerContext | Response> {
  const authorize = options.authorize ?? ALLOW_ALL;
  const result = await authorize(req);
  if (!result.ok) {
    return new Response(JSON.stringify({ error: result.message ?? "unauthorized" }), {
      status: result.status ?? 401,
      headers: { "content-type": "application/json" },
    });
  }
  return {
    registry: options.registry,
    viewer: result.viewer ?? null,
    scopes: new Set<Scope>(result.scopes ?? READ_ONLY_SCOPES),
    readOnly: !!options.readOnly,
    headers: req.headers,
    requestId:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2),
    searchProvider: options.searchProvider,
  };
}
