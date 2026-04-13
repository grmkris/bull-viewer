import type { Queue, Job } from "bullmq"
import type {
  JobCounts,
  JobListPage,
  JobSnapshot,
  JobState,
  QueueSnapshot,
} from "../types.ts"

const STATES_FOR_COUNTS = [
  "waiting",
  "active",
  "completed",
  "failed",
  "delayed",
  "paused",
  "prioritized",
  "waiting-children",
] as const

export async function getQueueSnapshot(queue: Queue): Promise<QueueSnapshot> {
  const [counts, isPaused] = await Promise.all([
    queue.getJobCounts(...STATES_FOR_COUNTS),
    queue.isPaused(),
  ])
  return {
    name: queue.name,
    counts: normalizeCounts(counts),
    isPaused,
  }
}

export interface ListJobsOptions {
  states: JobState[]
  start: number
  end: number
  nameFilter?: string
}

export async function listJobs(
  queue: Queue,
  options: ListJobsOptions,
): Promise<JobListPage> {
  const states = options.states.length ? options.states : (["waiting"] as JobState[])

  // Fetch a slightly wider window when name-filtering, so we can post-filter
  // and still return a useful page count. Cap the over-fetch at 4x.
  const window = options.end - options.start + 1
  const fetchEnd = options.nameFilter
    ? options.start + window * 4 - 1
    : options.end

  const [rawJobs, total] = await Promise.all([
    queue.getJobs(states, options.start, fetchEnd, true),
    queue.getJobCountByTypes(...states),
  ])

  const snapshots: JobSnapshot[] = []
  for (const job of rawJobs) {
    if (!job) continue
    if (options.nameFilter && !job.name.includes(options.nameFilter)) continue
    if (snapshots.length >= window) break
    const state = await safeState(job, states[0]!)
    snapshots.push(await snapshot(job, state))
  }

  return {
    jobs: snapshots,
    total,
    state: states[0]!,
    start: options.start,
    end: options.start + snapshots.length - 1,
  }
}

export async function getJob(
  queue: Queue,
  id: string,
): Promise<JobSnapshot | null> {
  const job = await queue.getJob(id)
  if (!job) return null
  const state = (await job.getState()) as JobState | "unknown"
  return snapshot(job, state)
}

async function safeState(
  job: Job,
  fallback: JobState,
): Promise<JobState | "unknown"> {
  try {
    return (await job.getState()) as JobState | "unknown"
  } catch {
    return fallback
  }
}

async function snapshot(
  job: Job,
  state: JobState | "unknown",
): Promise<JobSnapshot> {
  return {
    id: String(job.id),
    name: job.name,
    data: job.data,
    opts: job.opts,
    progress: job.progress,
    returnValue: job.returnvalue,
    failedReason: job.failedReason ?? null,
    stacktrace: job.stacktrace ?? [],
    attemptsMade: job.attemptsMade,
    timestamp: job.timestamp,
    processedOn: job.processedOn ?? null,
    finishedOn: job.finishedOn ?? null,
    state,
  }
}

function normalizeCounts(raw: Record<string, number>): JobCounts {
  return {
    waiting: raw.waiting ?? 0,
    active: raw.active ?? 0,
    completed: raw.completed ?? 0,
    failed: raw.failed ?? 0,
    delayed: raw.delayed ?? 0,
    paused: raw.paused ?? 0,
    prioritized: raw.prioritized ?? 0,
    "waiting-children": raw["waiting-children"] ?? 0,
  }
}
