"use client";

export interface ChartTheme {
  background: string;
  foreground: string;
  mutedForeground: string;
  gridline: string;
  threshold: string;
  completed: string;
  failed: string;
  p50: string;
  p95: string;
  p99: string;
  active: string;
  delayed: string;
}

const FALLBACK: ChartTheme = {
  background: "#0a0a0a",
  foreground: "#fafafa",
  mutedForeground: "#71717a",
  gridline: "#27272a",
  threshold: "#3f3f46",
  completed: "#10b981",
  failed: "#f43f5e",
  p50: "rgba(99,179,237,0.55)",
  p95: "rgba(99,179,237,0.80)",
  p99: "#3b82f6",
  active: "#3b82f6",
  delayed: "#f59e0b",
};

/** Reads CSS variables from the bv-root element. Falls back to a dark palette. */
export function readChartTheme(): ChartTheme {
  if (typeof document === "undefined") return FALLBACK;
  const root = document.querySelector(".bv-root") as HTMLElement | null;
  if (!root) return FALLBACK;
  const cs = getComputedStyle(root);
  const get = (name: string, fallback: string) =>
    cs.getPropertyValue(name).trim() || fallback;

  return {
    background: get("--background", FALLBACK.background),
    foreground: get("--foreground", FALLBACK.foreground),
    mutedForeground: get("--muted-foreground", FALLBACK.mutedForeground),
    gridline: get("--chart-gridline", FALLBACK.gridline),
    threshold: get("--chart-threshold", FALLBACK.threshold),
    completed: get("--chart-completed", FALLBACK.completed),
    failed: get("--chart-failed", FALLBACK.failed),
    p50: get("--chart-p50", FALLBACK.p50),
    p95: get("--chart-p95", FALLBACK.p95),
    p99: get("--chart-p99", FALLBACK.p99),
    active: get("--status-active", FALLBACK.active),
    delayed: get("--status-delayed", FALLBACK.delayed),
  };
}
