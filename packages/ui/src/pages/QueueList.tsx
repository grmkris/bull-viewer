"use client";

import type { QueueSnapshot } from "@grmkris/bull-viewer-core";
import { useQuery, useQueries } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";

import { Sparkline } from "../charts/Sparkline.tsx";
import { useBullViewer } from "../context.tsx";
import { StatusDot } from "../shell/StatusDot.tsx";

function healthState(
  q: QueueSnapshot
): "completed" | "delayed" | "failed" | "paused" {
  if (q.isPaused) return "paused";
  if (q.counts.failed > 0) return "failed";
  if (q.counts.delayed > 0 || q.counts.waiting > 100) return "delayed";
  return "completed";
}

export function QueueList() {
  const { api } = useBullViewer();

  const { data, isLoading } = useQuery({
    queryKey: ["queues"],
    queryFn: () => api.listQueues(),
    refetchInterval: 5_000,
  });

  const queues = data?.queues ?? [];

  // Fetch sparkline data for all queues in parallel (last 1h throughput)
  const sparkQueries = useQueries({
    queries: queues.map((q) => ({
      queryKey: ["queues", q.name, "metrics", { range: "1h" }],
      queryFn: () => api.getMetrics(q.name, "1h"),
      refetchInterval: 30_000,
    })),
  });

  if (isLoading && queues.length === 0) {
    return (
      <div className="font-mono text-sm text-muted-foreground">
        loading queues…
      </div>
    );
  }

  if (queues.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle className="font-mono">no queues</EmptyTitle>
          <EmptyDescription>
            register queues with{" "}
            <code className="bg-muted/50 rounded-sm px-1 font-mono text-[11px]">
              BULL_VIEWER_QUEUES=name1,name2
            </code>{" "}
            and restart the server.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="font-mono text-lg font-semibold">queues</h1>
        <span className="font-sans text-[10px] uppercase tracking-wide text-muted-foreground">
          {queues.length} registered
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {queues.map((q, i) => {
          const sparkData = sparkQueries[i]?.data?.buckets ?? [];
          const points = sparkData.map((b) => b.completed + b.failed);
          const health = healthState(q);
          return (
            <Link
              key={q.name}
              to="/queues/$name"
              params={{ name: q.name }}
              className="bg-card hover:border-foreground/30 group rounded-md border p-4 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <StatusDot state={health} size={8} />
                  <h2 className="font-mono text-sm font-semibold truncate">
                    {q.name}
                  </h2>
                </div>
                {q.isPaused && (
                  <span className="font-sans text-[9px] uppercase tracking-wide text-muted-foreground">
                    paused
                  </span>
                )}
              </div>
              <dl className="text-muted-foreground mt-3 grid grid-cols-3 gap-x-3 gap-y-1 font-mono text-[11px] tnum">
                <Stat label="wait" value={q.counts.waiting} />
                <Stat label="active" value={q.counts.active} />
                <Stat
                  label="failed"
                  value={q.counts.failed}
                  accent={q.counts.failed > 0 ? "failed" : undefined}
                />
                <Stat label="delayed" value={q.counts.delayed} />
                <Stat label="done" value={q.counts.completed} />
                <Stat label="paused" value={q.counts.paused} />
              </dl>
              <div className="mt-3 flex items-center justify-between">
                <span className="font-sans text-[9px] uppercase tracking-wide text-muted-foreground">
                  last 1h
                </span>
                <Sparkline
                  points={points}
                  width={120}
                  height={20}
                  stroke="var(--signal)"
                />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "failed" | "delayed";
}) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="font-sans text-[10px] uppercase tracking-wide">{label}</dt>
      <dd
        className={
          accent === "failed"
            ? "text-status-failed"
            : accent === "delayed"
              ? "text-status-delayed"
              : "text-foreground"
        }
      >
        {value}
      </dd>
    </div>
  );
}
