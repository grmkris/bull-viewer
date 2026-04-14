"use client";

import type { Scope, Viewer } from "@grmkris/bull-viewer-core";
import { ALL_SCOPES } from "@grmkris/bull-viewer-core";
import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { createApiClient } from "./api-client.ts";
import { BullViewerProvider, type TenantSummary } from "./context.tsx";
import { useDensity } from "./hooks/use-density.ts";
import { useTheme } from "./hooks/use-theme.ts";
import { createBullViewerRouter } from "./router.tsx";

import "./styles.css";

export interface BullViewerAppProps {
  basePath?: string;
  apiBase: string;
  viewer?: Viewer | null;
  scopes?: Scope[];
  history?: "browser" | "memory";
}

/**
 * Duck-type check for an oRPC-thrown typed error. We don't `import`
 * `ORPCError` because the class identity can differ between the server
 * package and the client package, and `instanceof` is unreliable across
 * that boundary.
 */
interface TypedError {
  code?: string;
  message?: string;
  data?: unknown;
  status?: number;
}

function asTypedError(err: unknown): TypedError | null {
  if (!err || typeof err !== "object") return null;
  const e = err as TypedError;
  if (typeof e.code !== "string") return null;
  return e;
}

/**
 * Map an error to a sonner toast variant + copy. Centralized here so
 * components don't have to import sonner — the QueryCache/MutationCache
 * onError handlers call this for every failed query and mutation.
 *
 * Query failures only toast for 5xx / Forbidden / ReadOnly — routine 404s
 * on a stale job refetch shouldn't pop a toast. Mutation failures always
 * toast because the user explicitly clicked something.
 */
function toastError(err: unknown, kind: "query" | "mutation"): void {
  const typed = asTypedError(err);
  const message =
    typed?.message ?? (err instanceof Error ? err.message : String(err));

  if (typed) {
    switch (typed.code) {
      case "ReadOnly":
      case "READ_ONLY":
        toast.error("Dashboard is read-only", { description: message });
        return;
      case "Forbidden":
      case "FORBIDDEN":
        toast.error("Not permitted", { description: message });
        return;
      case "QueueMissing":
      case "QUEUE_MISSING":
        toast.error("Queue not registered", { description: message });
        return;
      case "NotFound":
      case "NOT_FOUND":
        if (kind === "mutation") {
          toast.error("Not found", { description: message });
        }
        return;
      case "InvalidState":
      case "INVALID_STATE":
      case "CONFLICT":
        toast.warning("Invalid state", { description: message });
        return;
      case "RateLimited":
      case "TOO_MANY_REQUESTS":
        toast.warning("Rate limited", { description: message });
        return;
      default:
        break;
    }
  }

  if (kind === "mutation") {
    toast.error("Action failed", { description: message });
  } else if (typed?.status != null && typed.status >= 500) {
    toast.error("Server error", { description: message });
  }
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
      mutations: {
        retry: 0,
      },
    },
    queryCache: new QueryCache({
      onError: (err) => toastError(err, "query"),
    }),
    mutationCache: new MutationCache({
      onError: (err) => toastError(err, "mutation"),
    }),
  });
}

interface TenantsResponse {
  tenants: TenantSummary[];
  default: string;
}

type BootstrapState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; tenants: TenantSummary[]; currentId: string };

const TENANT_STORAGE_PREFIX = "bv:tenant:";

function tenantStorageKey(basePath: string): string {
  return `${TENANT_STORAGE_PREFIX}${basePath || "/"}`;
}

function readStoredTenant(basePath: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(tenantStorageKey(basePath));
  } catch {
    return null;
  }
}

function writeStoredTenant(basePath: string, id: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(tenantStorageKey(basePath), id);
  } catch {
    /* ignore quota / private mode */
  }
}

async function fetchTenants(apiBase: string): Promise<TenantsResponse> {
  const base = apiBase.endsWith("/") ? apiBase.slice(0, -1) : apiBase;
  const res = await fetch(`${base}/tenants`, { credentials: "include" });
  if (!res.ok) {
    throw new Error(`tenants endpoint returned ${res.status}`);
  }
  const json = (await res.json()) as TenantsResponse;
  if (!Array.isArray(json.tenants) || json.tenants.length === 0) {
    throw new Error("tenants endpoint returned an empty list");
  }
  return json;
}

export function BullViewerApp(props: BullViewerAppProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const router = useMemo(() => {
    if (!mounted) return null;
    return createBullViewerRouter({
      basePath: props.basePath ?? "/",
      history: props.history ?? "browser",
    });
  }, [mounted, props.basePath, props.history]);

  const queryClient = useMemo(() => makeQueryClient(), []);

  // Bootstrap: fetch /tenants once, restore the user's last selection,
  // surface meta errors with a retryable error state.
  const [bootstrap, setBootstrap] = useState<BootstrapState>({
    kind: "loading",
  });
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    if (!mounted) return;
    let cancelled = false;
    setBootstrap({ kind: "loading" });
    fetchTenants(props.apiBase)
      .then((res) => {
        if (cancelled) return;
        const stored = readStoredTenant(props.basePath ?? "/");
        const valid =
          stored && res.tenants.some((t) => t.id === stored)
            ? stored
            : res.default;
        setBootstrap({
          kind: "ready",
          tenants: res.tenants,
          currentId: valid,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setBootstrap({
          kind: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [mounted, props.apiBase, props.basePath, retryNonce]);

  // Build the typed api client whenever the tenant changes. Recreating the
  // bundle is microsecond-cheap and gives us a clean RPC URL for the new
  // tenant. The cache wipe inside `setTenant` makes sure no stale tenant-A
  // data is rendered against the new tenant's queue list.
  const currentTenantId =
    bootstrap.kind === "ready" ? bootstrap.currentId : null;
  const api = useMemo(() => {
    if (!currentTenantId) return null;
    return createApiClient(props.apiBase, currentTenantId);
  }, [props.apiBase, currentTenantId]);

  const setTenant = useCallback(
    (id: string) => {
      if (bootstrap.kind !== "ready") return;
      if (!bootstrap.tenants.some((t) => t.id === id)) return;
      if (id === bootstrap.currentId) return;
      writeStoredTenant(props.basePath ?? "/", id);
      // Wipe everything in flight before swapping the client — defensive,
      // even though the new client URL also forces a refetch.
      queryClient.clear();
      setBootstrap({ ...bootstrap, currentId: id });
    },
    [bootstrap, props.basePath, queryClient]
  );

  const contextValue = useMemo(() => {
    if (bootstrap.kind !== "ready" || !api) return null;
    const current = bootstrap.tenants.find((t) => t.id === bootstrap.currentId);
    if (!current) return null;
    return {
      api,
      viewer: props.viewer ?? null,
      scopes: new Set<Scope>(props.scopes ?? ALL_SCOPES),
      tenants: bootstrap.tenants,
      currentTenant: current,
      setTenant,
    };
  }, [bootstrap, api, props.viewer, props.scopes, setTenant]);

  // Apply theme + density classes to the bv-root wrapper so they take effect
  // even when embedded (we don't own <html>).
  const { resolved: theme } = useTheme();
  const { density } = useDensity();
  const rootClassName = `bv-root bg-background text-foreground min-h-svh ${
    theme === "dark" ? "dark" : ""
  }`;

  if (!router || bootstrap.kind === "loading") {
    return (
      <div className={rootClassName} data-density={density}>
        <div className="text-muted-foreground p-6 font-mono text-sm">
          <span className="bv-caret" />
          loading bull-viewer
        </div>
      </div>
    );
  }

  if (bootstrap.kind === "error") {
    return (
      <div className={rootClassName} data-density={density}>
        <div className="text-destructive p-6 font-mono text-sm space-y-2">
          <div>could not load tenants: {bootstrap.message}</div>
          <button
            type="button"
            onClick={() => setRetryNonce((n) => n + 1)}
            className="text-muted-foreground hover:text-foreground underline"
          >
            retry
          </button>
        </div>
      </div>
    );
  }

  if (!contextValue) {
    return (
      <div className={rootClassName} data-density={density}>
        <div className="text-muted-foreground p-6 font-mono text-sm">
          <span className="bv-caret" />
          no tenants configured
        </div>
      </div>
    );
  }

  return (
    <div className={rootClassName} data-density={density}>
      <QueryClientProvider client={queryClient}>
        <BullViewerProvider value={contextValue}>
          <RouterProvider router={router} />
        </BullViewerProvider>
      </QueryClientProvider>
    </div>
  );
}

export type { Viewer, Scope };
