"use client"

import { useEffect, useMemo, useState } from "react"
import { RouterProvider } from "@tanstack/react-router"
import type { Scope, Viewer } from "@bull-viewer/core"
import { ALL_SCOPES } from "@bull-viewer/core"
import { createApiClient } from "./api-client.ts"
import { BullViewerProvider } from "./context.tsx"
import { createBullViewerRouter } from "./router.tsx"
import "./styles.css"

export interface BullViewerAppProps {
  basePath?: string
  apiBase: string
  viewer?: Viewer | null
  scopes?: Scope[]
  history?: "browser" | "memory"
}

export function BullViewerApp(props: BullViewerAppProps) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const router = useMemo(() => {
    if (!mounted) return null
    return createBullViewerRouter({
      basePath: props.basePath ?? "/",
      history: props.history ?? "browser",
    })
  }, [mounted, props.basePath, props.history])

  const value = useMemo(
    () => ({
      api: createApiClient(props.apiBase),
      viewer: props.viewer ?? null,
      scopes: new Set<Scope>(props.scopes ?? ALL_SCOPES),
    }),
    [props.apiBase, props.viewer, props.scopes],
  )

  if (!router) {
    return (
      <div className="bv-root bg-background text-foreground min-h-svh">
        <div className="text-muted-foreground p-6 text-sm">Loading…</div>
      </div>
    )
  }

  return (
    <BullViewerProvider value={value}>
      <RouterProvider router={router} />
    </BullViewerProvider>
  )
}

export type { Viewer, Scope }
