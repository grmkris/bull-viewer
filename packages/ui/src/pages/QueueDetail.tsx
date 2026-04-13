import { useEffect, useState } from "react"
import { Link, useParams } from "@tanstack/react-router"
import type { JobListPage, JobState } from "@bull-viewer/core"
import { useBullViewer } from "../context.tsx"

const STATES: JobState[] = [
  "waiting",
  "active",
  "completed",
  "failed",
  "delayed",
  "paused",
]

export function QueueDetail() {
  const { name } = useParams({ from: "/queues/$name" })
  const { api } = useBullViewer()
  const [state, setState] = useState<JobState>("waiting")
  const [page, setPage] = useState<JobListPage | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setPage(null)
    setError(null)
    api
      .listJobs(name, state)
      .then((res) => {
        if (!cancelled) setPage(res)
      })
      .catch((err) => {
        if (!cancelled) setError(String(err))
      })
    return () => {
      cancelled = true
    }
  }, [api, name, state])

  return (
    <div className="space-y-4">
      <div>
        <Link
          to="/"
          className="text-muted-foreground hover:text-foreground text-xs"
        >
          ← all queues
        </Link>
        <h1 className="font-heading mt-1 text-lg font-semibold">{name}</h1>
      </div>

      <div className="flex flex-wrap gap-1">
        {STATES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setState(s)}
            className={
              state === s
                ? "bg-primary text-primary-foreground rounded-sm px-2 py-1 text-xs"
                : "text-muted-foreground hover:bg-muted hover:text-foreground rounded-sm px-2 py-1 text-xs"
            }
          >
            {s}
          </button>
        ))}
      </div>

      {error && <div className="text-destructive text-sm">{error}</div>}
      {!page && !error && (
        <div className="text-muted-foreground text-sm">Loading…</div>
      )}
      {page && page.jobs.length === 0 && (
        <div className="text-muted-foreground text-sm">
          No {state} jobs.
        </div>
      )}
      {page && page.jobs.length > 0 && (
        <div className="bg-card rounded-md border">
          {page.jobs.map((job) => (
            <Link
              key={job.id}
              to="/queues/$name/jobs/$id"
              params={{ name, id: job.id }}
              className="hover:bg-muted/50 flex items-center justify-between gap-2 border-b px-3 py-2 text-xs last:border-b-0"
            >
              <div className="flex min-w-0 flex-col">
                <span className="font-mono">#{job.id}</span>
                <span className="text-muted-foreground truncate">
                  {job.name}
                </span>
              </div>
              <span className="text-muted-foreground font-mono">
                {new Date(job.timestamp).toLocaleString()}
              </span>
            </Link>
          ))}
        </div>
      )}
      {page && (
        <div className="text-muted-foreground text-xs">
          {page.jobs.length} of {page.total}
        </div>
      )}
    </div>
  )
}
