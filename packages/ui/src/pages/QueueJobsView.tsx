"use client"

import { useNavigate, useParams, useSearch } from "@tanstack/react-router"
import { JobsTable } from "../jobs/JobsTable.tsx"
import { JobDrawer } from "../jobs/JobDrawer.tsx"
import { FilterChipBar } from "../jobs/FilterChipBar.tsx"
import { useLiveTail } from "../jobs/useLiveTail.ts"
import type { JobStateFilter } from "../jobs/filterSchema.ts"

export function QueueJobsView() {
  const { name } = useParams({ from: "/queues/$name" })
  const search = useSearch({ from: "/queues/$name" })
  const navigate = useNavigate()

  const states = (search.states ??
    ["failed", "active", "waiting"]) as JobStateFilter[]
  const nameFilter = search.name ?? ""
  const liveTail = (search.live as boolean | undefined) ?? false
  const selectedJobId = search.job

  useLiveTail(name, liveTail)

  const updateSearch = (next: Partial<typeof search>) => {
    navigate({
      to: "/queues/$name",
      params: { name },
      search: (prev) => ({ ...prev, ...next }),
    })
  }

  return (
    <div className="-m-4 flex h-[calc(100svh-9.5rem)] flex-col md:h-[calc(100svh-9.5rem)]">
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
