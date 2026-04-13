"use client";

import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

import { cn } from "@/lib/utils";

import { useBullViewer } from "../context.tsx";
import { StatusDot } from "../shell/StatusDot.tsx";
import { QueueJobsView } from "./QueueJobsView.tsx";

// Lazy-load the metrics/charts page so uPlot stays out of the base bundle
const QueueOverview = lazy(() =>
  import("./QueueOverview.tsx").then((m) => ({ default: m.QueueOverview }))
);

const TABS = [
  { value: "overview", label: "overview" },
  { value: "jobs", label: "jobs" },
] as const;
type Tab = (typeof TABS)[number]["value"];

export function QueueDetail() {
  const { name } = useParams({ from: "/queues/$name" });
  const search = useSearch({ from: "/queues/$name" });
  const navigate = useNavigate();
  const { api } = useBullViewer();
  const tab = (search.tab as Tab | undefined) ?? "overview";

  const { data: queueData } = useQuery({
    queryKey: ["queues", name],
    queryFn: () => api.getQueue(name),
    refetchInterval: 5_000,
  });
  const counts = queueData?.queue?.counts;

  const setTab = (next: Tab) => {
    void navigate({
      to: "/queues/$name",
      params: { name },
      search: (prev) => ({ ...prev, tab: next }),
    });
  };

  return (
    <div className="-m-4 flex flex-col">
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
            <CountChip
              label="completed"
              value={counts.completed}
              state="completed"
            />
          </div>
        )}
      </div>

      <div className="bg-card flex items-center gap-1 border-b px-4">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTab(t.value)}
            className={cn(
              "relative font-sans text-[11px] uppercase tracking-wide px-2 py-2 transition-colors",
              tab === t.value
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
            {tab === t.value && (
              <span className="bg-signal absolute inset-x-2 -bottom-px h-px" />
            )}
          </button>
        ))}
      </div>

      <div className="p-4">
        {tab === "overview" ? (
          <Suspense
            fallback={
              <div className="text-muted-foreground font-mono text-sm">
                <span className="bv-caret" />
                loading metrics
              </div>
            }
          >
            <QueueOverview />
          </Suspense>
        ) : (
          <QueueJobsView />
        )}
      </div>
    </div>
  );
}

function CountChip({
  label,
  value,
  state,
}: {
  label: string;
  value: number;
  state: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <StatusDot state={state} size={6} />
      <span className="font-sans text-[10px] uppercase tracking-wide">
        {label}
      </span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}
