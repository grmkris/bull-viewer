import type { Queue } from "bullmq"
import type { ActionResult } from "../types.ts"

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
