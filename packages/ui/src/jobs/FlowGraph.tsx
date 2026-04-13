"use client"

import { useMemo } from "react"
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react"
import dagre from "dagre"
import "@xyflow/react/dist/style.css"
import type { FlowGraph as Flow, FlowNode } from "../api-client.ts"
import { StatusDot } from "../shell/StatusDot.tsx"
import { cn } from "@/lib/utils"

interface FlowGraphProps {
  flow: Flow
  selectedId?: string
  onSelect: (id: string) => void
}

const NODE_WIDTH = 220
const NODE_HEIGHT = 64

interface JobNodeData extends Record<string, unknown> {
  flowNode: FlowNode
  selected: boolean
  onClick: () => void
}

function JobNode({ data }: NodeProps) {
  const { flowNode, selected, onClick } = data as JobNodeData
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "bg-card flex h-full w-full items-stretch overflow-hidden rounded-md border text-left transition-shadow",
        selected ? "ring-signal/60 ring-2" : "hover:border-foreground/30",
      )}
      style={{ width: NODE_WIDTH, height: NODE_HEIGHT }}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-1 !w-1 !border-0 !bg-transparent"
      />
      <div
        className="w-1 shrink-0"
        style={{ backgroundColor: `var(--status-${stateColorOf(flowNode.state)})` }}
      />
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 px-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-foreground truncate font-mono text-xs">
            {flowNode.name}
          </span>
          <span className="text-muted-foreground font-sans text-[9px] uppercase tracking-wide">
            {flowNode.state}
          </span>
        </div>
        <div className="text-muted-foreground flex items-center gap-2 font-mono text-[10px] tnum">
          <span>#{flowNode.id}</span>
          {flowNode.maxAttempts && (
            <span>
              att {flowNode.attemptsMade}/{flowNode.maxAttempts}
            </span>
          )}
          {flowNode.durationMs != null && (
            <span>{(flowNode.durationMs / 1000).toFixed(1)}s</span>
          )}
        </div>
      </div>
      <div className="px-2">
        <StatusDot
          state={flowNode.state}
          size={9}
          progress={
            flowNode.state === "active" && flowNode.maxAttempts
              ? flowNode.attemptsMade / flowNode.maxAttempts
              : undefined
          }
        />
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-1 !w-1 !border-0 !bg-transparent"
      />
    </button>
  )
}

function stateColorOf(state: string): string {
  if (
    state === "waiting" ||
    state === "active" ||
    state === "completed" ||
    state === "failed" ||
    state === "delayed" ||
    state === "paused" ||
    state === "stalled"
  )
    return state
  if (state === "waiting-children") return "children"
  return "waiting"
}

const nodeTypes = { job: JobNode }

function layoutWithDagre(
  nodes: FlowNode[],
  edges: { from: string; to: string }[],
): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({
    rankdir: "TB",
    ranker: "tight-tree",
    nodesep: 32,
    ranksep: 48,
  })

  for (const n of nodes) {
    g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT })
  }
  for (const e of edges) {
    g.setEdge(e.from, e.to)
  }
  dagre.layout(g)

  const out: Node[] = nodes.map((n) => {
    const pos = g.node(n.id)
    return {
      id: n.id,
      type: "job",
      position: {
        x: pos.x - NODE_WIDTH / 2,
        y: pos.y - NODE_HEIGHT / 2,
      },
      data: {
        flowNode: n,
        selected: false,
        onClick: () => {},
      } satisfies JobNodeData,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    }
  })

  const outEdges: Edge[] = edges.map((e) => ({
    id: `${e.from}->${e.to}`,
    source: e.from,
    target: e.to,
    type: "smoothstep",
    style: { stroke: "var(--muted-foreground)", strokeWidth: 1.25 },
  }))

  return { nodes: out, edges: outEdges }
}

export function FlowGraph({ flow, selectedId, onSelect }: FlowGraphProps) {
  const layout = useMemo(
    () => layoutWithDagre(flow.nodes, flow.edges),
    [flow.nodes, flow.edges],
  )

  // Inject selection + click handler into node data
  const decoratedNodes = useMemo<Node[]>(
    () =>
      layout.nodes.map((n) => ({
        ...n,
        data: {
          ...(n.data as JobNodeData),
          selected: selectedId === n.id,
          onClick: () => onSelect(n.id),
        },
      })),
    [layout.nodes, selectedId, onSelect],
  )

  return (
    <div className="bg-card relative h-[60vh] min-h-[360px] overflow-hidden rounded-md border">
      <ReactFlow
        nodes={decoratedNodes}
        edges={layout.edges}
        nodeTypes={nodeTypes}
        fitView
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={true}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
        <Controls className="!shadow-none" />
        <MiniMap
          pannable
          zoomable
          maskColor="rgba(0,0,0,0.4)"
          nodeColor={(node) => {
            const data = node.data as JobNodeData
            return `var(--status-${stateColorOf(data.flowNode.state)})`
          }}
        />
      </ReactFlow>
    </div>
  )
}
