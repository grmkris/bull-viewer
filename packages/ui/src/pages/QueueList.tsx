import { useEffect, useState } from "react"
import { Link } from "@tanstack/react-router"
import type { QueueSnapshot } from "@bull-viewer/core"
import { useBullViewer } from "../context.tsx"

export function QueueList() {
  const { api } = useBullViewer()
  const [queues, setQueues] = useState<QueueSnapshot[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api
      .listQueues()
      .then((res) => {
        if (!cancelled) setQueues(res.queues)
      })
      .catch((err) => {
        if (!cancelled) setError(String(err))
      })
    return () => {
      cancelled = true
    }
  }, [api])

  if (error) return <div className="text-destructive">{error}</div>
  if (!queues) return <div className="text-muted-foreground">Loading…</div>
  if (queues.length === 0)
    return <div className="text-muted-foreground">No queues registered.</div>

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {queues.map((q) => (
        <Link
          key={q.name}
          to="/queues/$name"
          params={{ name: q.name }}
          className="bg-card hover:border-ring rounded-md border p-4 transition-colors"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-base font-semibold">{q.name}</h2>
            {q.isPaused && (
              <span className="text-muted-foreground text-[0.625rem] uppercase">
                paused
              </span>
            )}
          </div>
          <dl className="text-muted-foreground mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            <Stat label="waiting" value={q.counts.waiting} />
            <Stat label="active" value={q.counts.active} />
            <Stat label="completed" value={q.counts.completed} />
            <Stat label="failed" value={q.counts.failed} />
            <Stat label="delayed" value={q.counts.delayed} />
            <Stat label="paused" value={q.counts.paused} />
          </dl>
        </Link>
      ))}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt>{label}</dt>
      <dd className="text-foreground font-mono">{value}</dd>
    </div>
  )
}
