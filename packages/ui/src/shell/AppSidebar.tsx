"use client"

import { useEffect, useMemo, useState } from "react"
import { Link, useParams } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { SearchIcon, StarIcon } from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import type { QueueSnapshot } from "@bull-viewer/core"
import { useBullViewer } from "../context.tsx"
import { StatusDot } from "./StatusDot.tsx"

interface QueueGroup {
  prefix: string | null
  queues: QueueSnapshot[]
}

function groupByPrefix(queues: QueueSnapshot[]): QueueGroup[] {
  const groups = new Map<string, QueueSnapshot[]>()
  for (const q of queues) {
    const idx = q.name.indexOf(":")
    const prefix = idx > 0 ? q.name.slice(0, idx) : ""
    const list = groups.get(prefix) ?? []
    list.push(q)
    groups.set(prefix, list)
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([prefix, queues]) => ({
      prefix: prefix || null,
      queues: queues.sort((a, b) => a.name.localeCompare(b.name)),
    }))
}

function healthState(q: QueueSnapshot): "completed" | "delayed" | "failed" | "paused" {
  if (q.isPaused) return "paused"
  if (q.counts.failed > 0) return "failed"
  if (q.counts.delayed > 0 || q.counts.waiting > 100) return "delayed"
  return "completed"
}

export function AppSidebar() {
  const { api } = useBullViewer()
  const params = useParams({ strict: false }) as { name?: string }
  const activeName = params.name
  const [filter, setFilter] = useState("")
  const { state } = useSidebar()
  const collapsed = state === "collapsed"

  const { data } = useQuery({
    queryKey: ["queues"],
    queryFn: () => api.listQueues(),
    refetchInterval: 5000,
  })

  const groups = useMemo(() => {
    const queues = data?.queues ?? []
    const filtered = filter
      ? queues.filter((q) => q.name.toLowerCase().includes(filter.toLowerCase()))
      : queues
    return groupByPrefix(filtered)
  }, [data, filter])

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link
          to="/"
          className="flex items-center gap-2 px-2 py-1.5 font-mono text-sm font-semibold tracking-tight"
        >
          <span className="text-signal">●</span>
          {!collapsed && <span>bull-viewer</span>}
        </Link>
        {!collapsed && (
          <InputGroup className="mt-1">
            <InputGroupAddon>
              <SearchIcon className="size-3.5 text-muted-foreground" />
            </InputGroupAddon>
            <InputGroupInput
              placeholder="filter queues"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="font-mono text-xs"
            />
          </InputGroup>
        )}
      </SidebarHeader>

      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.prefix ?? "_root"}>
            {!collapsed && group.prefix && (
              <SidebarGroupLabel className="font-mono text-[10px] tracking-wide uppercase">
                {group.prefix}
              </SidebarGroupLabel>
            )}
            <SidebarMenu>
              {group.queues.map((q) => {
                const shortName = group.prefix
                  ? q.name.slice(group.prefix.length + 1)
                  : q.name
                return (
                  <SidebarMenuItem key={q.name}>
                    <SidebarMenuButton
                      isActive={activeName === q.name}
                      tooltip={q.name}
                      render={
                        <Link to="/queues/$name" params={{ name: q.name }}>
                          <StatusDot state={healthState(q)} size={8} />
                          <span className="truncate font-mono text-xs">
                            {shortName}
                          </span>
                        </Link>
                      }
                    />
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}

        {groups.length === 0 && !collapsed && (
          <div className="px-3 py-2 font-mono text-xs text-muted-foreground">
            no queues
          </div>
        )}
      </SidebarContent>

      <SidebarFooter>
        {!collapsed && (
          <button
            type="button"
            className="font-sans text-[10px] tracking-wide uppercase text-muted-foreground hover:text-foreground transition-colors px-2 py-1 text-left flex items-center gap-1.5"
          >
            <StarIcon className="size-3" />
            pinned (soon)
          </button>
        )}
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}

/** Listens for ⌘\ to toggle sidebar — wired from the parent shell. */
export function useSidebarKeyboardToggle() {
  const { toggleSidebar } = useSidebar()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault()
        toggleSidebar()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [toggleSidebar])
}
