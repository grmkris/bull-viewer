"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate, useParams } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import {
  ArrowRightIcon,
  ContrastIcon,
  GaugeIcon,
  ListIcon,
  RefreshCcwIcon,
  SearchIcon,
  WorkflowIcon,
} from "lucide-react"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"
import { useShortcuts } from "../hooks/use-shortcuts.ts"
import { useTheme } from "../hooks/use-theme.ts"
import { useDensity } from "../hooks/use-density.ts"
import { useBullViewer } from "../context.tsx"
import { StatusDot } from "./StatusDot.tsx"

function useDebouncedValue<T>(value: T, delay: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return v
}

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const debouncedQuery = useDebouncedValue(query, 200)
  const navigate = useNavigate()
  const { setTheme, resolved } = useTheme()
  const { toggleDensity } = useDensity()
  const { api } = useBullViewer()
  const params = useParams({ strict: false }) as { name?: string }
  const currentQueue = params.name
  const inputRef = useRef<HTMLInputElement>(null)

  useShortcuts({
    "$mod+k": () => setOpen((v) => !v),
    "$mod+K": () => setOpen((v) => !v),
    Escape: () => setOpen(false),
  })

  // Tier 1: in-memory queue list
  const { data: queueData } = useQuery({
    queryKey: ["queues"],
    queryFn: () => api.listQueues(),
    enabled: open,
    staleTime: 30_000,
  })
  const queues = queueData?.queues ?? []

  // Tier 2: API-backed job search, scoped to the currently-viewed queue
  const { data: jobSearchData, isFetching: jobSearchLoading } = useQuery({
    queryKey: ["search", currentQueue ?? "_none", debouncedQuery],
    queryFn: ({ signal }) =>
      api.searchJobs(currentQueue!, debouncedQuery, { limit: 8, signal }),
    enabled:
      open && !!currentQueue && debouncedQuery.length >= 2,
    staleTime: 30_000,
  })
  const jobMatches = jobSearchData?.jobs ?? []

  // Filter queues client-side for the navigate group
  const queueMatches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return queues.slice(0, 6)
    return queues
      .filter((qu) => qu.name.toLowerCase().includes(q))
      .slice(0, 8)
  }, [queues, query])

  // Reset query when palette closes
  useEffect(() => {
    if (!open) setQuery("")
  }, [open])

  // Auto-focus input when opening
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  const close = () => setOpen(false)
  const run = (fn: () => void) => () => {
    close()
    fn()
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Command palette"
      description="Search queues, jobs, and actions"
    >
      <div className="flex items-center border-b">
        <span className="bv-caret pl-3" />
        <CommandInput
          ref={inputRef}
          placeholder="search queues, jobs, actions…"
          value={query}
          onValueChange={setQuery}
          className="font-mono"
        />
        {jobSearchLoading && (
          <span className="text-muted-foreground pr-3 font-sans text-[10px] uppercase tracking-wide">
            …
          </span>
        )}
      </div>

      <CommandList>
        <CommandEmpty>no matches</CommandEmpty>

        {queueMatches.length > 0 && (
          <CommandGroup heading="Queues">
            {queueMatches.map((q) => (
              <CommandItem
                key={q.name}
                value={`queue ${q.name}`}
                onSelect={run(() =>
                  navigate({ to: "/queues/$name", params: { name: q.name } }),
                )}
              >
                <StatusDot
                  state={
                    q.isPaused
                      ? "paused"
                      : q.counts.failed > 0
                        ? "failed"
                        : q.counts.delayed > 0
                          ? "delayed"
                          : "completed"
                  }
                  size={8}
                />
                <span className="font-mono">{q.name}</span>
                <CommandShortcut className="font-mono">
                  {q.counts.waiting + q.counts.active}/{q.counts.failed}
                </CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {currentQueue && jobMatches.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading={`Jobs in ${currentQueue}`}>
              {jobMatches.map((j) => (
                <CommandItem
                  key={j.id}
                  value={`job ${j.id} ${j.name}`}
                  onSelect={run(() =>
                    navigate({
                      to: "/queues/$name",
                      params: { name: currentQueue },
                      search: (prev) => ({ ...prev, job: j.id, tab: "jobs" }),
                    }),
                  )}
                >
                  <StatusDot state={j.state} size={8} />
                  <span className="font-mono text-xs">#{j.id}</span>
                  <span className="text-muted-foreground font-mono text-xs truncate">
                    {j.name}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        <CommandSeparator />

        <CommandGroup heading="Navigate">
          <CommandItem
            value="goto queues"
            onSelect={run(() => navigate({ to: "/" }))}
          >
            <ListIcon />
            <span>Queues</span>
            <CommandShortcut>g q</CommandShortcut>
          </CommandItem>
          {currentQueue && (
            <>
              <CommandItem
                value="goto jobs current"
                onSelect={run(() =>
                  navigate({
                    to: "/queues/$name",
                    params: { name: currentQueue },
                    search: (prev) => ({ ...prev, tab: "jobs" }),
                  }),
                )}
              >
                <WorkflowIcon />
                <span>Jobs in {currentQueue}</span>
                <CommandShortcut>g j</CommandShortcut>
              </CommandItem>
              <CommandItem
                value="goto overview current"
                onSelect={run(() =>
                  navigate({
                    to: "/queues/$name",
                    params: { name: currentQueue },
                    search: (prev) => ({ ...prev, tab: "overview" }),
                  }),
                )}
              >
                <GaugeIcon />
                <span>Overview of {currentQueue}</span>
                <CommandShortcut>g m</CommandShortcut>
              </CommandItem>
            </>
          )}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Settings">
          <CommandItem
            value="theme toggle"
            onSelect={run(() =>
              setTheme(resolved === "dark" ? "light" : "dark"),
            )}
          >
            <ContrastIcon />
            <span>toggle theme — currently {resolved}</span>
            <CommandShortcut>⌘⇧L</CommandShortcut>
          </CommandItem>
          <CommandItem value="density toggle" onSelect={run(toggleDensity)}>
            <RefreshCcwIcon />
            <span>toggle density</span>
            <CommandShortcut>⌘⇧D</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}

// touch unused import lint
void SearchIcon
void ArrowRightIcon
