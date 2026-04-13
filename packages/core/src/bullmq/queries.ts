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

export async function listJobs(
  queue: Queue,
  state: JobState,
  start: number,
  end: number,
): Promise<JobListPage> {
  const [jobs, total] = await Promise.all([
    queue.getJobs([state], start, end, true),
    queue.getJobCountByTypes(state),
  ])
  const snapshots: JobSnapshot[] = []
  for (const job of jobs) {
    if (!job) continue
    snapshots.push(await snapshot(job, state))
  }
  return { jobs: snapshots, total, state, start, end }
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
