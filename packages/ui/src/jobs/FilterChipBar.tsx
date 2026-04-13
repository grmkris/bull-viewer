"use client"

import { RadioIcon, SearchIcon, XIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { cn } from "@/lib/utils"
import type { JobStateFilter } from "./filterSchema.ts"
import { JOB_STATES } from "./filterSchema.ts"

interface FilterChipBarProps {
  states: JobStateFilter[]
  nameFilter: string
  onStatesChange: (states: JobStateFilter[]) => void
  onNameChange: (name: string) => void
  liveTail: boolean
  onToggleLive: () => void
}

const STATE_COLORS: Record<string, string> = {
  waiting: "bg-status-waiting",
  active: "bg-status-active",
  completed: "bg-status-completed",
  failed: "bg-status-failed",
  delayed: "bg-status-delayed",
  paused: "bg-status-paused",
  prioritized: "bg-status-active",
  "waiting-children": "bg-status-children",
}

export function FilterChipBar({
  states,
  nameFilter,
  onStatesChange,
  onNameChange,
  liveTail,
  onToggleLive,
}: FilterChipBarProps) {
  const toggleState = (s: JobStateFilter) => {
    if (states.includes(s)) {
      onStatesChange(states.filter((x) => x !== s))
    } else {
      onStatesChange([...states, s])
    }
  }

  return (
    <div className="bg-card flex flex-wrap items-center gap-2 border-b px-3 py-2">
      <div className="flex flex-wrap items-center gap-1">
        {JOB_STATES.map((s) => {
          const active = states.includes(s)
          return (
            <button
              key={s}
              type="button"
              onClick={() => toggleState(s)}
              className={cn(
                "group flex items-center gap-1.5 rounded-sm border px-2 py-1 font-sans text-[11px] transition-colors",
                active
                  ? "bg-foreground/5 border-foreground/30 text-foreground"
                  : "border-transparent text-muted-foreground hover:bg-muted/40 hover:text-foreground",
              )}
            >
              <span
                className={cn(
                  "inline-block size-1.5 rounded-full",
                  STATE_COLORS[s] ?? "bg-muted-foreground",
                )}
              />
              {s}
              {active && (
                <XIcon className="size-2.5 opacity-0 transition-opacity group-hover:opacity-100" />
              )}
            </button>
          )
        })}
      </div>

      <div className="flex-1" />

      <InputGroup className="w-48">
        <InputGroupAddon>
          <SearchIcon className="size-3.5 text-muted-foreground" />
        </InputGroupAddon>
        <InputGroupInput
          placeholder="filter by name…"
          value={nameFilter}
          onChange={(e) => onNameChange(e.target.value)}
          className="font-mono text-xs"
        />
      </InputGroup>

      <button
        type="button"
        onClick={onToggleLive}
        className={cn(
          "flex h-7 items-center gap-1.5 rounded-sm border px-2 font-sans text-[11px] tracking-wide uppercase transition-colors",
          liveTail
            ? "border-signal/40 bg-signal/10 text-signal"
            : "text-muted-foreground hover:text-foreground border-transparent",
        )}
      >
        <RadioIcon className={cn("size-3", liveTail && "bv-pulse")} />
        live
      </button>
    </div>
  )
}

export function ActiveFiltersDisplay({
  states,
  nameFilter,
}: {
  states: JobStateFilter[]
  nameFilter?: string
}) {
  if (states.length === 0 && !nameFilter) return null
  return (
    <div className="flex flex-wrap items-center gap-1 px-3 py-1.5 font-mono text-[11px]">
      {states.map((s) => (
        <Badge key={s} variant="outline" className="font-mono text-[10px]">
          {s}
        </Badge>
      ))}
      {nameFilter && (
        <Badge variant="outline" className="font-mono text-[10px]">
          name:{nameFilter}
        </Badge>
      )}
    </div>
  )
}
