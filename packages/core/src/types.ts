export type JobState =
  | "waiting"
  | "active"
  | "completed"
  | "failed"
  | "delayed"
  | "paused"
  | "waiting-children"
  | "prioritized"

export interface JobCounts {
  waiting: number
  active: number
  completed: number
  failed: number
  delayed: number
  paused: number
  prioritized: number
  "waiting-children": number
}

export interface QueueSnapshot {
  name: string
  counts: JobCounts
  isPaused: boolean
}

export interface JobSnapshot {
  id: string
  name: string
  data: unknown
  opts: unknown
  progress: number | object | string | boolean
  returnValue: unknown
  failedReason: string | null
  stacktrace: string[]
  attemptsMade: number
  timestamp: number
  processedOn: number | null
  finishedOn: number | null
  state: JobState | "unknown"
}

export interface JobListPage {
  jobs: JobSnapshot[]
  total: number
  state: JobState
  start: number
  end: number
}

export type Scope =
  | "read"
  | "retry"
  | "remove"
  | "pause"
  | "promote"
  | "schedule"
  | "edit"

export const ALL_SCOPES: Scope[] = [
  "read",
  "retry",
  "remove",
  "pause",
  "promote",
  "schedule",
  "edit",
]

export interface Viewer {
  id: string
  email?: string
  name?: string
  roles?: string[]
}

export interface ActionResult {
  ok: boolean
  reason?: string
}
