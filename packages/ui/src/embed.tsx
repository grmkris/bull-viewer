"use client";

import type { Scope, Viewer } from "@bull-viewer/core";
import { ALL_SCOPES } from "@bull-viewer/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { createApiClient } from "./api-client.ts";
import { BullViewerProvider } from "./context.tsx";
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

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });
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

  const value = useMemo(
    () => ({
      api: createApiClient(props.apiBase),
      viewer: props.viewer ?? null,
      scopes: new Set<Scope>(props.scopes ?? ALL_SCOPES),
    }),
    [props.apiBase, props.viewer, props.scopes]
  );

  // Apply theme + density classes to the bv-root wrapper so they take effect
  // even when embedded (we don't own <html>).
  const { resolved: theme } = useTheme();
  const { density } = useDensity();
  const rootClassName = `bv-root bg-background text-foreground min-h-svh ${
    theme === "dark" ? "dark" : ""
  }`;

  if (!router) {
    return (
      <div className={rootClassName} data-density={density}>
        <div className="text-muted-foreground p-6 font-mono text-sm">
          <span className="bv-caret" />
          loading bull-viewer
        </div>
      </div>
    );
  }

  return (
    <div className={rootClassName} data-density={density}>
      <QueryClientProvider client={queryClient}>
        <BullViewerProvider value={value}>
          <RouterProvider router={router} />
        </BullViewerProvider>
      </QueryClientProvider>
    </div>
  );
}

export type { Viewer, Scope };
