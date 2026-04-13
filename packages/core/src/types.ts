export type JobState =
  | "waiting"
  | "active"
  | "completed"
  | "failed"
  | "delayed"
  | "paused"
  | "waiting-children"
  | "prioritized";

export interface JobCounts {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
  prioritized: number;
  "waiting-children": number;
}

export interface QueueSnapshot {
  name: string;
  counts: JobCounts;
  isPaused: boolean;
}

export interface JobSnapshot {
  id: string;
  name: string;
  data: unknown;
  opts: unknown;
  progress: number | object | string | boolean;
  returnValue: unknown;
  failedReason: string | null;
  stacktrace: string[];
  attemptsMade: number;
  timestamp: number;
  processedOn: number | null;
  finishedOn: number | null;
  state: JobState | "unknown";
}

export interface JobListPage {
  jobs: JobSnapshot[];
  total: number;
  state: JobState;
  start: number;
  end: number;
}

/**
 * Scope contract — only values that are actually enforced by a procedure
 * should live here. Anything aspirational is a footgun because host apps
 * write `Authorize` functions that return scopes they expect to matter.
 *
 * Current enforcement points:
 *   - read:    readProcedure + SSE short-circuit
 *   - retry:   jobs.action + queues.bulk (dynamic check by input.action)
 *   - remove:  jobs.action + queues.bulk
 *   - promote: jobs.action + queues.bulk
 *   - pause:   queues.pause + queues.resume (shared, see NOTE in queues.ts)
 *
 * Add new scopes here only at the same time as the middleware that enforces
 * them. Purely read surfaces (metrics / flow / search) are gated by `read`.
 */
export type Scope = "read" | "retry" | "remove" | "pause" | "promote";

export const ALL_SCOPES: Scope[] = [
  "read",
  "retry",
  "remove",
  "pause",
  "promote",
];

/**
 * Scopes that are safe to grant by default to any authenticated viewer and
 * that cannot mutate queue state. Used by `buildContext` as the fallback
 * when `Authorize` returns `ok: true` without an explicit `scopes` array —
 * fail-closed rather than silently handing out full ALL_SCOPES.
 */
export const READ_ONLY_SCOPES: Scope[] = ["read"];

export interface Viewer {
  id: string;
  email?: string;
  name?: string;
  roles?: string[];
}

export interface ActionResult {
  ok: boolean;
  reason?: string;
}
