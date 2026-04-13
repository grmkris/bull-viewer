"use client"

import { useEffect, useRef, useState } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import type { JobSnapshot, JobState } from "@bull-viewer/core"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useBullViewer } from "../context.tsx"
import { useShortcuts } from "../hooks/use-shortcuts.ts"
import { JobRow } from "./JobRow.tsx"

interface JobsTableProps {
  queueName: string
  states: JobState[]
  nameFilter?: string
  selectedJobId?: string
  onOpen: (id: string) => void
}

const PAGE_SIZE = 50

export function JobsTable({
  queueName,
  states,
  nameFilter,
  selectedJobId,
  onOpen,
}: JobsTableProps) {
  const { api } = useBullViewer()
  const queryClient = useQueryClient()
  const parentRef = useRef<HTMLDivElement>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [multiSelected, setMultiSelected] = useState<Set<string>>(new Set())

  const stateKey = states.slice().sort().join(",")

  const { data, isLoading, error } = useQuery({
    queryKey: ["queues", queueName, "jobs", { stateKey, nameFilter }],
    queryFn: () =>
      api.listJobs(queueName, {
        states,
        name: nameFilter,
        start: 0,
        end: PAGE_SIZE - 1,
      }),
    refetchInterval: 5_000,
  })

  const jobs: JobSnapshot[] = data?.jobs ?? []
  const total = data?.total ?? 0

  // Reset active index + multi-select when filters change
  useEffect(() => {
    setActiveIndex(0)
    setMultiSelected(new Set())
  }, [stateKey, nameFilter, queueName])

  const virtualizer = useVirtualizer({
    count: jobs.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 32,
    overscan: 8,
  })

  // j/k navigation — opens the drawer at activeIndex
  useShortcuts({
    j: () => {
      setActiveIndex((i) => {
        const next = Math.min(i + 1, jobs.length - 1)
        const job = jobs[next]
        if (job) onOpen(job.id)
        virtualizer.scrollToIndex(next, { align: "auto" })
        return next
      })
    },
    k: () => {
      setActiveIndex((i) => {
        const next = Math.max(i - 1, 0)
        const job = jobs[next]
        if (job) onOpen(job.id)
        virtualizer.scrollToIndex(next, { align: "auto" })
        return next
      })
    },
    Enter: () => {
      const job = jobs[activeIndex]
      if (job) onOpen(job.id)
    },
    x: () => {
      const job = jobs[activeIndex]
      if (!job) return
      setMultiSelected((prev) => {
        const next = new Set(prev)
        if (next.has(job.id)) next.delete(job.id)
        else next.add(job.id)
        return next
      })
    },
  })

  const handleClick = (id: string, e: React.MouseEvent) => {
    if (e.shiftKey && multiSelected.size > 0) {
      const idx = jobs.findIndex((j) => j.id === id)
      const lastSelectedIdx = jobs.findIndex((j) => multiSelected.has(j.id))
      const [from, to] = idx > lastSelectedIdx ? [lastSelectedIdx, idx] : [idx, lastSelectedIdx]
      setMultiSelected((prev) => {
        const next = new Set(prev)
        for (let i = from; i <= to; i++) {
          const j = jobs[i]
          if (j) next.add(j.id)
        }
        return next
      })
      return
    }
    setActiveIndex(jobs.findIndex((j) => j.id === id))
    onOpen(id)
  }

  const handleToggle = (id: string) => {
    setMultiSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Live invalidation hook for SSE-driven refresh (wired by parent via useLiveTail)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { queue: string }
      if (detail.queue === queueName) {
        queryClient.invalidateQueries({
          queryKey: ["queues", queueName, "jobs"],
        })
      }
    }
    window.addEventListener("bv:live-event", handler)
    return () => window.removeEventListener("bv:live-event", handler)
  }, [queueName, queryClient])

  if (error) {
    return (
      <div className="p-6 font-mono text-sm text-status-failed">
        {error instanceof Error ? error.message : String(error)}
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col table-container" style={{ containerType: "inline-size", containerName: "jobs" } as React.CSSProperties}>
      <div className="bg-card sticky top-0 z-10 flex items-center gap-3 border-b px-3 font-sans text-[10px] tracking-wide uppercase text-muted-foreground" style={{ height: "28px" }}>
        <div className="shrink-0 w-4" />
        <div className="shrink-0 w-4" />
        <div className="shrink-0 w-28">id</div>
        <div className="flex-1">name</div>
        <div className="col-age shrink-0 w-24 text-right">age</div>
        <div className="col-attempts shrink-0 w-12 text-right">att</div>
        <div className="col-duration shrink-0 w-16 text-right">dur</div>
      </div>

      <div ref={parentRef} className="flex-1 overflow-auto">
        {isLoading && jobs.length === 0 && (
          <div className="p-6 font-mono text-sm text-muted-foreground">loading…</div>
        )}
        {!isLoading && jobs.length === 0 && (
          <div className="p-6 font-mono text-sm text-muted-foreground">
            no jobs match these filters
          </div>
        )}

        {jobs.length > 0 && (
          <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {virtualizer.getVirtualItems().map((vRow) => {
              const job = jobs[vRow.index]
              if (!job) return null
              return (
                <div
                  key={job.id}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    transform: `translateY(${vRow.start}px)`,
                  }}
                >
                  <JobRow
                    job={job}
                    selected={selectedJobId === job.id}
                    active={vRow.index === activeIndex}
                    multiSelected={multiSelected.has(job.id)}
                    onClick={handleClick}
                    onToggle={handleToggle}
                    showCheckbox={multiSelected.size > 0}
                  />
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="bg-card flex items-center justify-between border-t px-3 py-1.5 font-sans text-[10px] tracking-wide uppercase text-muted-foreground">
        <span>showing {jobs.length} of {total}</span>
        {multiSelected.size > 0 && (
          <span className="text-foreground">{multiSelected.size} selected</span>
        )}
      </div>

      <BulkActionBar
        selected={multiSelected}
        onClear={() => setMultiSelected(new Set())}
        queueName={queueName}
      />
    </div>
  )
}

interface BulkActionBarProps {
  selected: Set<string>
  onClear: () => void
  queueName: string
}

function BulkActionBar({ selected, onClear, queueName }: BulkActionBarProps) {
  const { api, scopes } = useBullViewer()
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)

  if (selected.size === 0) return null

  async function run(action: "retry" | "remove" | "promote") {
    setBusy(true)
    try {
      await api.bulkAction(queueName, { action, ids: [...selected] })
      onClear()
      queryClient.invalidateQueries({ queryKey: ["queues", queueName, "jobs"] })
      queryClient.invalidateQueries({ queryKey: ["queues"] })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-card pointer-events-auto fixed bottom-20 left-1/2 z-20 -translate-x-1/2 rounded-md border shadow-xl md:bottom-6">
      <div className="flex items-center gap-3 px-3 py-2 font-sans text-xs">
        <span className="font-mono">{selected.size} selected</span>
        {scopes.has("retry") && (
          <button
            type="button"
            disabled={busy}
            onClick={() => run("retry")}
            className="hover:text-foreground text-muted-foreground transition-colors disabled:opacity-50"
          >
            retry
          </button>
        )}
        {scopes.has("promote") && (
          <button
            type="button"
            disabled={busy}
            onClick={() => run("promote")}
            className="hover:text-foreground text-muted-foreground transition-colors disabled:opacity-50"
          >
            promote
          </button>
        )}
        {scopes.has("remove") && (
          <button
            type="button"
            disabled={busy}
            onClick={() => run("remove")}
            className="text-status-failed transition-colors disabled:opacity-50"
          >
            remove
          </button>
        )}
        <span className="text-muted-foreground">·</span>
        <button
          type="button"
          onClick={onClear}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          clear
        </button>
      </div>
    </div>
  )
}
