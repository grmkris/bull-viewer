import type { Scope, Viewer } from "@bull-viewer/core";
import { createContext, useContext } from "react";

import type { ApiClient } from "./api-client.ts";

export interface BullViewerContextValue {
  api: ApiClient;
  viewer: Viewer | null;
  scopes: Set<Scope>;
}

const BullViewerContext = createContext<BullViewerContextValue | null>(null);

export const BullViewerProvider = BullViewerContext.Provider;

export function useBullViewer(): BullViewerContextValue {
  const ctx = useContext(BullViewerContext);
  if (!ctx)
    throw new Error("useBullViewer must be used inside <BullViewerApp />");
  return ctx;
}
