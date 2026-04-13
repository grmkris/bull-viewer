import type { Queue } from "bullmq"
import type { ActionResult, JobState } from "../types.ts"

export type JobAction = "retry" | "remove" | "promote"

export async function retryJob(
  queue: Queue,
  id: string,
): Promise<ActionResult> {
  const job = await queue.getJob(id)
  if (!job) return { ok: false, reason: "job not found" }
  await job.retry()
  return { ok: true }
}

export async function removeJob(
  queue: Queue,
  id: string,
): Promise<ActionResult> {
  const job = await queue.getJob(id)
  if (!job) return { ok: false, reason: "job not found" }
  await job.remove()
  return { ok: true }
}

export async function promoteJob(
  queue: Queue,
  id: string,
): Promise<ActionResult> {
  const job = await queue.getJob(id)
  if (!job) return { ok: false, reason: "job not found" }
  await job.promote()
  return { ok: true }
}

export async function pauseQueue(queue: Queue): Promise<ActionResult> {
  await queue.pause()
  return { ok: true }
}

export async function resumeQueue(queue: Queue): Promise<ActionResult> {
  await queue.resume()
  return { ok: true }
}

export interface BulkActionOptions {
  action: JobAction
  ids?: string[]
  filter?: {
    states: JobState[]
    nameFilter?: string
  }
  /** Hard cap on operations per call, default 1000. */
  cap?: number
}

export interface BulkActionResult {
  ok: boolean
  attempted: number
  succeeded: number
  failed: number
  errors: { id: string; reason: string }[]
}

export async function bulkAction(
  queue: Queue,
  options: BulkActionOptions,
): Promise<BulkActionResult> {
  const cap = options.cap ?? 1000
  let ids: string[] = []

  if (options.ids?.length) {
    ids = options.ids.slice(0, cap)
  } else if (options.filter) {
    const states = options.filter.states.length
      ? options.filter.states
      : (["failed"] as JobState[])
    const jobs = await queue.getJobs(states, 0, cap - 1, true)
    for (const job of jobs) {
      if (!job) continue
      if (
        options.filter.nameFilter &&
        !job.name.includes(options.filter.nameFilter)
      )
        continue
      if (ids.length >= cap) break
      ids.push(String(job.id))
    }
  }

  const result: BulkActionResult = {
    ok: true,
    attempted: ids.length,
    succeeded: 0,
    failed: 0,
    errors: [],
  }

  const ops = ids.map(async (id) => {
    try {
      const r =
        options.action === "retry"
          ? await retryJob(queue, id)
          : options.action === "remove"
            ? await removeJob(queue, id)
            : await promoteJob(queue, id)
      if (r.ok) result.succeeded++
      else {
        result.failed++
        result.errors.push({ id, reason: r.reason ?? "unknown" })
      }
    } catch (err) {
      result.failed++
      result.errors.push({
        id,
        reason: err instanceof Error ? err.message : String(err),
      })
    }
  })

  await Promise.all(ops)
  if (result.failed > 0 && result.succeeded === 0) result.ok = false
  return result
}
