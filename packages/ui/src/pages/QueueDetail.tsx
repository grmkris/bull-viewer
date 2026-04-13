"use client"

import { useNavigate, useParams, useSearch } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { useBullViewer } from "../context.tsx"
import { JobsTable } from "../jobs/JobsTable.tsx"
import { JobDrawer } from "../jobs/JobDrawer.tsx"
import { FilterChipBar } from "../jobs/FilterChipBar.tsx"
import { useLiveTail } from "../jobs/useLiveTail.ts"
import type { JobStateFilter } from "../jobs/filterSchema.ts"
import { StatusDot } from "../shell/StatusDot.tsx"

export function QueueDetail() {
  const { name } = useParams({ from: "/queues/$name" })
  const search = useSearch({ from: "/queues/$name" })
  const navigate = useNavigate()
  const { api } = useBullViewer()

  const states = (search.states ?? ["failed", "active", "waiting"]) as JobStateFilter[]
  const nameFilter = search.name ?? ""
  const liveTail = (search.live as boolean | undefined) ?? false
  const selectedJobId = search.job

  // Subscribe to live events when the toggle is on
  useLiveTail(name, liveTail)

  // Queue snapshot for the header counts
  const { data: queueData } = useQuery({
    queryKey: ["queues", name],
    queryFn: () => api.getQueue(name),
    refetchInterval: liveTail ? false : 5_000,
  })
  const counts = queueData?.queue?.counts

  const updateSearch = (next: Partial<typeof search>) => {
    navigate({
      to: "/queues/$name",
      params: { name },
      search: (prev) => ({ ...prev, ...next }),
    })
  }

  return (
    <div className="-m-4 flex h-[calc(100svh-3rem)] flex-col md:-m-4">
      {/* Header strip with queue name + counts */}
      <div className="bg-card flex flex-wrap items-center gap-4 border-b px-4 py-3">
        <h1 className="font-mono text-base font-semibold tracking-tight">
          {name}
        </h1>
        {counts && (
          <div className="flex items-center gap-3 font-mono text-[11px] tnum text-muted-foreground">
            <CountChip label="waiting" value={counts.waiting} state="waiting" />
            <CountChip label="active" value={counts.active} state="active" />
            <CountChip label="failed" value={counts.failed} state="failed" />
            <CountChip label="delayed" value={counts.delayed} state="delayed" />
            <CountChip label="completed" value={counts.completed} state="completed" />
          </div>
        )}
      </div>

      <FilterChipBar
        states={states}
        nameFilter={nameFilter}
        onStatesChange={(s) => updateSearch({ states: s })}
        onNameChange={(n) => updateSearch({ name: n || undefined })}
        liveTail={liveTail}
        onToggleLive={() => updateSearch({ live: !liveTail })}
      />

      <div className="min-h-0 flex-1">
        <JobsTable
          queueName={name}
          states={states}
          nameFilter={nameFilter || undefined}
          selectedJobId={selectedJobId}
          onOpen={(id) => updateSearch({ job: id })}
        />
      </div>

      <JobDrawer
        queueName={name}
        jobId={selectedJobId}
        onClose={() => updateSearch({ job: undefined })}
      />
    </div>
  )
}

function CountChip({
  label,
  value,
  state,
}: {
  label: string
  value: number
  state: string
}) {
  return (
    <div className="flex items-center gap-1.5">
      <StatusDot state={state} size={6} />
      <span className="font-sans text-[10px] uppercase tracking-wide">{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  )
}
