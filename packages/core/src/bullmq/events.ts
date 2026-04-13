import { QueueEvents } from "bullmq"
import type { ConnectionOptions } from "bullmq"
import type { JobState } from "../types.ts"

export interface QueueEventMessage {
  type: "added" | "active" | "completed" | "failed" | "delayed" | "removed" | "stalled"
  jobId: string
  queue: string
  ts: number
  state?: JobState
  data?: unknown
}

export type QueueEventListener = (event: QueueEventMessage) => void

interface QueueEventsRef {
  events: QueueEvents
  listeners: Set<QueueEventListener>
  refCount: number
}

const refs = new Map<string, QueueEventsRef>()

/**
 * Subscribe to BullMQ QueueEvents for a queue. Returns an unsubscribe fn.
 * Multiple subscribers share a single QueueEvents instance per queue (refcounted).
 */
export function subscribeQueueEvents(
  queueName: string,
  connection: ConnectionOptions,
  listener: QueueEventListener,
): () => void {
  let ref = refs.get(queueName)
  if (!ref) {
    const events = new QueueEvents(queueName, { connection })
    ref = { events, listeners: new Set(), refCount: 0 }
    refs.set(queueName, ref)

    const emit = (
      type: QueueEventMessage["type"],
      args: { jobId: string; [k: string]: unknown },
      _id?: string,
    ) => {
      const msg: QueueEventMessage = {
        type,
        jobId: args.jobId,
        queue: queueName,
        ts: Date.now(),
      }
      for (const cb of ref!.listeners) {
        try {
          cb(msg)
        } catch {
          /* swallow */
        }
      }
    }

    events.on("added", (a, id) => emit("added", a, id))
    events.on("active", (a, id) => emit("active", a, id))
    events.on("completed", (a, id) => emit("completed", a, id))
    events.on("failed", (a, id) => emit("failed", a, id))
    events.on("delayed", (a, id) => emit("delayed", a, id))
    events.on("removed", (a, id) => emit("removed", a, id))
    events.on("stalled", (a, id) => emit("stalled", a, id))
  }

  ref.listeners.add(listener)
  ref.refCount++

  return () => {
    if (!ref) return
    ref.listeners.delete(listener)
    ref.refCount--
    if (ref.refCount === 0) {
      void ref.events.close()
      refs.delete(queueName)
    }
  }
}
