import type { Scope, Viewer } from "@grmkris/bull-viewer-core";
import { createContext, useContext } from "react";

import type { ApiClient } from "./api-client.ts";

/**
 * Lightweight summary returned by the `/tenants` meta endpoint. The UI only
 * needs the id (for selection), label (for display), and queueCount (for the
 * picker subtitle). Everything else lives behind the tenant-scoped RPC URL.
 */
export interface TenantSummary {
  id: string;
  label: string;
  queueCount: number;
}

export interface BullViewerContextValue {
  api: ApiClient;
  viewer: Viewer | null;
  scopes: Set<Scope>;
  /** All tenants advertised by the server, in declaration order. */
  tenants: TenantSummary[];
  /** Currently active tenant — always one of `tenants`. */
  currentTenant: TenantSummary;
  /**
   * Switch to a different tenant. Persists the choice to localStorage,
   * clears the React-Query cache, and recreates the typed oRPC client so
   * every subsequent request lands on the new tenant's RPC URL.
   *
   * No-op if the id is unknown or already current.
   */
  setTenant: (id: string) => void;
}

const BullViewerContext = createContext<BullViewerContextValue | null>(null);

export const BullViewerProvider = BullViewerContext.Provider;

export function useBullViewer(): BullViewerContextValue {
  const ctx = useContext(BullViewerContext);
  if (!ctx) {
    throw new Error("useBullViewer must be used inside <BullViewerApp />");
  }
  return ctx;
}
