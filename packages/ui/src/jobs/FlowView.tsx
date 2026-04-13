"use client"

import { lazy, Suspense, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useBullViewer } from "../context.tsx"
import { IndentedFlowTree } from "./IndentedFlowTree.tsx"
import type { FlowGraph as Flow } from "../api-client.ts"

// Lazy-load the canvas chunk (React Flow + dagre, ~75 KB gz)
const FlowGraph = lazy(() =>
  import("./FlowGraph.tsx").then((m) => ({ default: m.FlowGraph })),
)

interface FlowViewProps {
  queueName: string
  jobId: string
  onSelect: (id: string) => void
  selectedId?: string
}

function maxDepth(flow: Flow): number {
  const childrenOf = new Map<string, string[]>()
  for (const e of flow.edges) {
    const list = childrenOf.get(e.from) ?? []
    list.push(e.to)
    childrenOf.set(e.from, list)
  }
  const visit = (id: string, depth: number): number => {
    const kids = childrenOf.get(id) ?? []
    if (kids.length === 0) return depth
    return Math.max(...kids.map((k) => visit(k, depth + 1)))
  }
  return visit(flow.rootId, 0)
}

function isMobile(): boolean {
  if (typeof window === "undefined") return false
  return window.matchMedia?.("(max-width: 767px)").matches ?? false
}

export function FlowView({
  queueName,
  jobId,
  onSelect,
  selectedId,
}: FlowViewProps) {
  const { api } = useBullViewer()
  const [view, setView] = useState<"tree" | "graph" | null>(null)

  const { data: flow, isLoading, error } = useQuery({
    queryKey: ["queues", queueName, "flow", jobId],
    queryFn: () => api.getFlow(queueName, jobId),
    refetchInterval: 5_000,
  })

  if (isLoading && !flow) {
    return (
      <div className="text-muted-foreground font-mono text-xs">
        <span className="bv-caret" />
        loading flow
      </div>
    )
  }
  if (error) {
    return (
      <div className="text-status-failed font-mono text-xs">
        {error instanceof Error ? error.message : String(error)}
      </div>
    )
  }
  if (!flow || flow.nodes.length <= 1) {
    return (
      <div className="text-muted-foreground font-mono text-xs">
        this job has no parent or children — not part of a flow.
      </div>
    )
  }

  const totalNodes = flow.nodes.length
  const depth = maxDepth(flow)
  const heuristicTree = (totalNodes <= 8 && depth <= 3) || isMobile()
  const effectiveView: "tree" | "graph" = view ?? (heuristicTree ? "tree" : "graph")

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="font-sans text-[10px] uppercase tracking-wide text-muted-foreground">
          {totalNodes} nodes · depth {depth}
        </div>
        <div className="bg-card flex items-center gap-px rounded-md border p-px">
          {(["tree", "graph"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={
                effectiveView === v
                  ? "bg-foreground/10 text-foreground rounded-sm px-2 py-1 font-mono text-[10px]"
                  : "text-muted-foreground hover:text-foreground rounded-sm px-2 py-1 font-mono text-[10px] transition-colors"
              }
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {effectiveView === "tree" ? (
        <IndentedFlowTree
          flow={flow}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ) : (
        <Suspense
          fallback={
            <div className="text-muted-foreground font-mono text-xs">
              <span className="bv-caret" />
              loading canvas
            </div>
          }
        >
          <FlowGraph flow={flow} selectedId={selectedId} onSelect={onSelect} />
        </Suspense>
      )}
    </div>
  )
}
