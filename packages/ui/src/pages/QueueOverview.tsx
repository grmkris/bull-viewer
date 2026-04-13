"use client"

import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { useParams, useSearch, useNavigate } from "@tanstack/react-router"
import type { AlignedData } from "uplot"
import { useBullViewer } from "../context.tsx"
import { UPlotChart } from "../charts/UPlotChart.tsx"
import { readChartTheme } from "../charts/themeColors.ts"
import { cn } from "@/lib/utils"
import { StatusDot } from "../shell/StatusDot.tsx"

const RANGES = ["15m", "1h", "6h", "24h", "7d"] as const
type Range = (typeof RANGES)[number]

interface MetricBucket {
  ts: number
  completed: number
  failed: number
  waiting: number | null
  delayed: number | null
  active: number | null
  oldestWaiting: number | null
  oldestActive: number | null
  p50: number | null
  p95: number | null
  p99: number | null
}

export function QueueOverview() {
  const { name } = useParams({ from: "/queues/$name" })
  const search = useSearch({ from: "/queues/$name" })
  const navigate = useNavigate()
  const { api } = useBullViewer()
  const range = (search.range as Range | undefined) ?? "1h"

  const { data: queueData } = useQuery({
    queryKey: ["queues", name],
    queryFn: () => api.getQueue(name),
    refetchInterval: 10_000,
  })

  const { data: metricsData, isLoading } = useQuery({
    queryKey: ["queues", name, "metrics", { range }],
    queryFn: async () => {
      const res = await fetch(
        `${api.apiBase}/queues/${encodeURIComponent(name)}/metrics?range=${range}`,
      )
      if (!res.ok) throw new Error(`metrics ${res.status}`)
      return res.json() as Promise<{ buckets: MetricBucket[] }>
    },
    refetchInterval: 10_000,
  })

  const buckets = metricsData?.buckets ?? []
  const counts = queueData?.queue?.counts

  const setRange = (r: Range) => {
    navigate({
      to: "/queues/$name",
      params: { name },
      search: (prev) => ({ ...prev, range: r }),
    })
  }

  const lastBucket = buckets[buckets.length - 1]
  const recentThroughput = useMemo(() => {
    const last15 = buckets.slice(-15)
    const total = last15.reduce((sum, b) => sum + b.completed + b.failed, 0)
    return Math.round(total / Math.max(last15.length, 1))
  }, [buckets])
  const recentFailureRate = useMemo(() => {
    const last15 = buckets.slice(-15)
    const c = last15.reduce((s, b) => s + b.completed, 0)
    const f = last15.reduce((s, b) => s + b.failed, 0)
    if (c + f === 0) return 0
    return (f / (c + f)) * 100
  }, [buckets])

  // ─── chart data ───
  const throughputData: AlignedData = useMemo(() => {
    const ts = buckets.map((b) => Math.floor(b.ts / 1000))
    const completed = buckets.map((b) => b.completed)
    const failed = buckets.map((b) => b.failed)
    return [ts, completed, failed]
  }, [buckets])

  const failureRateData: AlignedData = useMemo(() => {
    const ts = buckets.map((b) => Math.floor(b.ts / 1000))
    const rate = buckets.map((b) => {
      const total = b.completed + b.failed
      return total === 0 ? 0 : (b.failed / total) * 100
    })
    return [ts, rate]
  }, [buckets])

  const percentileData: AlignedData = useMemo(() => {
    const ts = buckets.map((b) => Math.floor(b.ts / 1000))
    const p50 = buckets.map((b) => b.p50 ?? null)
    const p95 = buckets.map((b) => b.p95 ?? null)
    const p99 = buckets.map((b) => b.p99 ?? null)
    return [ts, p50, p95, p99] as AlignedData
  }, [buckets])

  const backlogData: AlignedData = useMemo(() => {
    const ts = buckets.map((b) => Math.floor(b.ts / 1000))
    const waiting = buckets.map((b) => b.waiting ?? null)
    return [ts, waiting] as AlignedData
  }, [buckets])

  const theme = useMemo(() => readChartTheme(), [])

  const throughputSeries = useMemo(
    () => [
      {},
      {
        label: "completed",
        stroke: theme.completed,
        fill: theme.completed + "33",
        width: 1.5,
      },
      {
        label: "failed",
        stroke: theme.failed,
        fill: theme.failed + "33",
        width: 1.5,
      },
    ],
    [theme],
  )

  const failureRateSeries = useMemo(
    () => [
      {},
      {
        label: "%",
        stroke: theme.failed,
        fill: theme.failed + "20",
        width: 1.5,
      },
    ],
    [theme],
  )

  const percentileSeries = useMemo(
    () => [
      {},
      { label: "p50", stroke: theme.p50, width: 1, dash: [4, 4] },
      { label: "p95", stroke: theme.p95, width: 1.5 },
      { label: "p99", stroke: theme.p99, width: 2 },
    ],
    [theme],
  )

  const backlogSeries = useMemo(
    () => [
      {},
      {
        label: "waiting",
        stroke: theme.delayed,
        fill: theme.delayed + "20",
        width: 1.5,
      },
    ],
    [theme],
  )

  const allEmpty = buckets.every((b) => b.completed === 0 && b.failed === 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="font-sans text-[10px] uppercase tracking-wide text-muted-foreground">
          range
        </div>
        <div className="bg-card flex items-center gap-px rounded-md border p-px">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={cn(
                "rounded-sm px-2 py-1 font-mono text-[11px] tnum transition-colors",
                range === r
                  ? "bg-foreground/10 text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile
          label="throughput"
          value={`${recentThroughput}/min`}
          sub="avg last 15m"
          state="active"
        />
        <Tile
          label="failure rate"
          value={`${recentFailureRate.toFixed(2)}%`}
          sub="last 15m"
          state={
            recentFailureRate > 5
              ? "failed"
              : recentFailureRate > 1
                ? "delayed"
                : "completed"
          }
        />
        <Tile
          label="waiting"
          value={`${counts?.waiting ?? "—"}`}
          sub="now"
          state="waiting"
        />
        <Tile
          label="active"
          value={`${counts?.active ?? "—"}`}
          sub="workers running"
          state="active"
        />
      </div>

      {isLoading && (
        <div className="font-mono text-sm text-muted-foreground">
          loading metrics…
        </div>
      )}

      {!isLoading && allEmpty && (
        <div className="bg-muted/20 rounded-md border border-dashed p-6 text-center font-mono text-xs text-muted-foreground">
          collecting metrics — nothing recorded in this range yet.
          <br />
          <span className="text-[10px]">
            (a worker that processes jobs must be running to populate
            historical data)
          </span>
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <ChartCard label="throughput" hint="completed + failed per minute">
          <UPlotChart
            data={throughputData}
            series={throughputSeries}
            syncKey="queue-overview"
          />
        </ChartCard>

        <ChartCard label="failure rate" hint="% over rolling minute">
          <UPlotChart
            data={failureRateData}
            series={failureRateSeries}
            syncKey="queue-overview"
          />
        </ChartCard>

        <ChartCard label="process time" hint="p50 / p95 / p99 in ms">
          <UPlotChart
            data={percentileData}
            series={percentileSeries}
            syncKey="queue-overview"
          />
        </ChartCard>

        <ChartCard label="waiting backlog" hint="snapshot every minute">
          <UPlotChart
            data={backlogData}
            series={backlogSeries}
            syncKey="queue-overview"
          />
        </ChartCard>
      </div>

      <div className="pt-2 text-right font-sans text-[10px] uppercase tracking-wide text-muted-foreground">
        last updated{" "}
        {lastBucket ? new Date(lastBucket.ts).toLocaleTimeString() : "—"}
      </div>
    </div>
  )
}

function Tile({
  label,
  value,
  sub,
  state,
}: {
  label: string
  value: string
  sub: string
  state: string
}) {
  return (
    <div className="bg-card rounded-md border p-3">
      <div className="flex items-center justify-between font-sans text-[10px] uppercase tracking-wide text-muted-foreground">
        <span>{label}</span>
        <StatusDot state={state} size={8} />
      </div>
      <div className="mt-1.5 font-mono text-2xl font-semibold tnum">{value}</div>
      <div className="font-sans text-[10px] text-muted-foreground">{sub}</div>
    </div>
  )
}

function ChartCard({
  label,
  hint,
  children,
}: {
  label: string
  hint: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-card rounded-md border p-3">
      <div className="mb-2 flex items-baseline justify-between">
        <div className="font-sans text-[11px] uppercase tracking-wide text-foreground">
          {label}
        </div>
        <div className="font-sans text-[10px] text-muted-foreground">{hint}</div>
      </div>
      {children}
    </div>
  )
}
