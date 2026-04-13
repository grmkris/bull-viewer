import type { Queue } from "bullmq"
import type { JobSnapshot, JobState } from "../types.ts"

export interface SearchInput {
  queue: Queue
  query: string
  states?: JobState[]
  limit?: number
}

export interface SearchResult {
  jobs: JobSnapshot[]
  truncated: boolean
  scanned: number
  durationMs: number
}

export interface SearchProvider {
  search(input: SearchInput): Promise<SearchResult>
}

const DEFAULT_LIMIT = 20
const SCAN_CAP = 10_000
const TIME_BUDGET_MS = 2_000

const ALL_STATES: JobState[] = [
  "waiting",
  "active",
  "completed",
  "failed",
  "delayed",
  "paused",
  "prioritized",
  "waiting-children",
]

function looksLikeJobId(query: string): boolean {
  return /^[A-Za-z0-9_-]{1,64}$/.test(query)
}

async function snapshot(job: any, fallbackState: JobState): Promise<JobSnapshot> {
  let state: JobState | "unknown" = fallbackState
  try {
    state = (await job.getState()) as JobState | "unknown"
  } catch {
    /* swallow */
  }
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

/**
 * Default Redis SCAN-based search provider.
 *
 * - Tier 0: if `query` looks like a job id, try queue.getJob(query) first.
 * - Tier 1: iterate jobs across the requested states (or all states),
 *   substring-match on name / data / failedReason. Hard caps:
 *     * SCAN_CAP jobs read total (10k)
 *     * TIME_BUDGET_MS wall time (2s)
 *     * `limit` results returned (default 20)
 */
export const RedisScanSearchProvider: SearchProvider = {
  async search({ queue, query, states, limit = DEFAULT_LIMIT }) {
    const t0 = Date.now()
    const trimmed = query.trim()
    if (!trimmed) {
      return { jobs: [], truncated: false, scanned: 0, durationMs: 0 }
    }

    const results: JobSnapshot[] = []

    // Tier 0: exact id lookup
    if (looksLikeJobId(trimmed)) {
      try {
        const job = await queue.getJob(trimmed)
        if (job) {
          results.push(await snapshot(job, "waiting"))
        }
      } catch {
        /* swallow */
      }
    }

    if (results.length >= limit) {
      return {
        jobs: results,
        truncated: false,
        scanned: 1,
        durationMs: Date.now() - t0,
      }
    }

    // Tier 1: scan across requested states
    const statesToScan = states && states.length > 0 ? states : ALL_STATES
    let scanned = 0
    let truncated = false
    const lower = trimmed.toLowerCase()
    const seen = new Set(results.map((j) => j.id))

    outer: for (const state of statesToScan) {
      // Page through this state in chunks of 200
      let offset = 0
      const PAGE = 200
      while (true) {
        if (Date.now() - t0 > TIME_BUDGET_MS) {
          truncated = true
          break outer
        }
        if (scanned >= SCAN_CAP) {
          truncated = true
          break outer
        }

        const remaining = Math.min(PAGE, SCAN_CAP - scanned)
        const batch = await queue.getJobs([state], offset, offset + remaining - 1, true)
        if (!batch || batch.length === 0) break

        for (const job of batch) {
          if (!job) continue
          scanned++
          if (seen.has(String(job.id))) continue

          const haystacks = [
            job.name?.toLowerCase() ?? "",
            String(job.id).toLowerCase(),
            JSON.stringify(job.data ?? "").toLowerCase(),
            (job.failedReason ?? "").toLowerCase(),
          ]
          if (haystacks.some((h) => h.includes(lower))) {
            results.push(await snapshot(job, state))
            seen.add(String(job.id))
            if (results.length >= limit) break outer
          }
        }

        if (batch.length < remaining) break
        offset += batch.length
      }
    }

    return {
      jobs: results,
      truncated,
      scanned,
      durationMs: Date.now() - t0,
    }
  },
}
