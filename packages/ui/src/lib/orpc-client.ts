import type { AppRouterClient } from "@bull-viewer/api";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { BatchLinkPlugin } from "@orpc/client/plugins";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";

export type BullViewerClient = AppRouterClient;

export interface OrpcClientBundle {
  client: BullViewerClient;
  orpc: ReturnType<typeof createTanstackQueryUtils<BullViewerClient>>;
}

/**
 * Resolve a possibly-relative apiBase into an absolute URL. RPCLink requires
 * an absolute URL (relative paths throw "Invalid URL" inside `new URL()`).
 * When `apiBase` is relative and we're in the browser, resolve it against
 * `window.location.origin`.
 */
function absolutize(apiBase: string): string {
  const stripped = apiBase.endsWith("/") ? apiBase.slice(0, -1) : apiBase;
  if (/^https?:\/\//.test(stripped)) return stripped;
  if (typeof window !== "undefined" && window.location?.origin) {
    const origin = window.location.origin;
    return stripped.startsWith("/")
      ? `${origin}${stripped}`
      : `${origin}/${stripped}`;
  }
  // SSR / non-browser context: RPCLink will throw if called; return as-is so
  // the error surfaces clearly rather than silently masking the misuse.
  return stripped;
}

/**
 * Build a typed oRPC client + TanStack Query utils bound to a given API base.
 * The `apiBase` should NOT include the `/rpc` suffix — it's appended here so
 * callers can pass the same value they'd use for SSE and other raw endpoints.
 *
 * Plugin strategy:
 *   - **No `DedupeRequestsPlugin`**: TanStack Query already dedupes concurrent
 *     calls with the same `queryKey`, so the link-level dedupe was redundant
 *     for queries AND actively harmful for mutations — it would drop a second
 *     "retry" click as a duplicate, silently losing user intent.
 *   - **No `ClientRetryPlugin`**: TanStack Query's `retry` option handles
 *     transient query failures (already `retry: 1` in the QueryClient). On
 *     mutations, retrying non-idempotent operations like `remove`/`promote`
 *     can double-apply if the server succeeds but the client never sees the
 *     response.
 *   - **Keep `BatchLinkPlugin`**: coalesces concurrent calls into one HTTP
 *     round trip. Mirrors the server's `BatchHandlerPlugin`. Safe for both
 *     queries and mutations because batching only merges the transport.
 */
export function createOrpcClient(apiBase: string): OrpcClientBundle {
  const base = absolutize(apiBase);
  const link = new RPCLink({
    url: `${base}/rpc`,
    fetch: (input, init) =>
      globalThis.fetch(input, { ...init, credentials: "include" }),
    plugins: [
      new BatchLinkPlugin({
        groups: [{ condition: () => true, context: {} }],
      }),
    ],
  });
  const client = createORPCClient(link) as BullViewerClient;
  const orpc = createTanstackQueryUtils(client);
  return { client, orpc };
}
