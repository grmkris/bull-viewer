"use client"

import { useMemo, useState } from "react"
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { StatusDot } from "../shell/StatusDot.tsx"
import type { FlowGraph, FlowNode } from "../api-client.ts"

interface IndentedFlowTreeProps {
  flow: FlowGraph
  selectedId?: string
  onSelect: (id: string) => void
}

interface TreeNode {
  node: FlowNode
  depth: number
  children: TreeNode[]
}

function buildTree(flow: FlowGraph): TreeNode | null {
  const byId = new Map<string, FlowNode>()
  for (const n of flow.nodes) byId.set(n.id, n)
  const root = byId.get(flow.rootId)
  if (!root) return null

  const childrenOf = new Map<string, FlowNode[]>()
  for (const e of flow.edges) {
    const list = childrenOf.get(e.from) ?? []
    const child = byId.get(e.to)
    if (child) list.push(child)
    childrenOf.set(e.from, list)
  }

  const visit = (node: FlowNode, depth: number): TreeNode => ({
    node,
    depth,
    children: (childrenOf.get(node.id) ?? []).map((c) => visit(c, depth + 1)),
  })

  return visit(root, 0)
}

export function IndentedFlowTree({
  flow,
  selectedId,
  onSelect,
}: IndentedFlowTreeProps) {
  const tree = useMemo(() => buildTree(flow), [flow])
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  if (!tree) {
    return (
      <div className="text-muted-foreground p-4 font-mono text-xs">
        flow not available
      </div>
    )
  }

  const toggle = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const renderNode = (n: TreeNode): React.ReactNode => {
    const isCollapsed = collapsed.has(n.node.id)
    const hasChildren = n.children.length > 0
    const isSelected = selectedId === n.node.id

    return (
      <div key={`${n.node.queue}:${n.node.id}`}>
        <button
          type="button"
          onClick={() => onSelect(n.node.id)}
          className={cn(
            "group hover:bg-muted/40 relative flex w-full items-center gap-2 border-l-[3px] border-transparent px-2 py-2 text-left transition-colors",
            isSelected && "bg-muted/60 border-l-[3px]",
          )}
          style={{
            paddingLeft: `${8 + n.depth * 20}px`,
            borderLeftColor: isSelected ? `var(--status-${stateColor(n.node.state)})` : undefined,
          }}
        >
          {hasChildren && (
            <span
              role="button"
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation()
                toggle(n.node.id)
              }}
              className="text-muted-foreground hover:text-foreground -ml-4 mr-0.5 inline-flex"
            >
              {isCollapsed ? (
                <ChevronRightIcon className="size-3" />
              ) : (
                <ChevronDownIcon className="size-3" />
              )}
            </span>
          )}
          <StatusDot
            state={n.node.state}
            size={9}
            progress={
              n.node.state === "active" && n.node.maxAttempts
                ? n.node.attemptsMade / n.node.maxAttempts
                : undefined
            }
          />
          <span className="font-mono text-xs text-muted-foreground tnum">
            #{n.node.id}
          </span>
          <span className="text-foreground min-w-0 truncate font-mono text-xs">
            {n.node.name}
          </span>
          {n.node.external && (
            <span className="text-muted-foreground bg-muted ml-auto rounded-sm px-1 py-0.5 font-sans text-[9px] uppercase tracking-wide">
              {n.node.queue}
            </span>
          )}
          {!n.node.external && (
            <span className="ml-auto font-sans text-[10px] uppercase tracking-wide text-muted-foreground">
              {n.node.state}
            </span>
          )}
        </button>
        {!isCollapsed && hasChildren && (
          <div>{n.children.map((c) => renderNode(c))}</div>
        )}
      </div>
    )
  }

  return (
    <div className="bg-card divide-y rounded-md border">
      {renderNode(tree)}
    </div>
  )
}

function stateColor(state: string): string {
  if (
    state === "waiting" ||
    state === "active" ||
    state === "completed" ||
    state === "failed" ||
    state === "delayed" ||
    state === "paused" ||
    state === "stalled"
  ) {
    return state
  }
  if (state === "waiting-children") return "children"
  return "waiting"
}
