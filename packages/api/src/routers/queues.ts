import type { JobState, QueueSnapshot } from "@grmkris/bull-viewer-core";
import {
  bulkAction,
  type BulkActionResult,
  getQueueSnapshot,
  pauseQueue,
  resumeQueue,
} from "@grmkris/bull-viewer-core/server";
import { z } from "zod";

import {
  queueProcedure,
  readProcedure,
  scopedQueueMutation,
  writableQueueProcedure,
} from "../lib/orpc.ts";

export const jobStateSchema = z.enum([
  "waiting",
  "active",
  "completed",
  "failed",
  "delayed",
  "paused",
  "waiting-children",
  "prioritized",
] as const);

/**
 * Empty snapshot placeholder returned when a per-queue Redis call fails in
 * `list`. Keeps the list payload intact so one bad queue doesn't blow up
 * the whole sidebar — the caller sees the queue with zeroed counts.
 */
function errorPlaceholder(name: string): QueueSnapshot {
  return {
    name,
    counts: {
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
      paused: 0,
      prioritized: 0,
      "waiting-children": 0,
    },
    isPaused: false,
  };
}

export const queuesRouter = {
  list: readProcedure.handler(
    async ({ context }): Promise<{ queues: QueueSnapshot[] }> => {
      const names = context.registry.listQueueNames();
      // Promise.allSettled so a single Redis blip on one queue doesn't
      // nuke the whole list — each queue gets either a real snapshot or
      // an error placeholder with zeroed counts.
      const settled = await Promise.allSettled(
        names.map(async (name) => {
          const q = context.registry.getQueue(name);
          if (!q) return errorPlaceholder(name);
          return await getQueueSnapshot(q);
        })
      );
      const queues = settled.map((r, i) =>
        r.status === "fulfilled" ? r.value : errorPlaceholder(names[i]!)
      );
      return { queues };
    }
  ),

  get: queueProcedure
    .input(z.object({ name: z.string() }))
    .handler(async ({ context }): Promise<{ queue: QueueSnapshot }> => {
      const queue = context.queue!;
      return { queue: await getQueueSnapshot(queue) };
    }),

  pause: scopedQueueMutation("pause")
    .input(z.object({ name: z.string() }))
    .handler(async ({ context }) => {
      const queue = context.queue!;
      return await pauseQueue(queue);
    }),

  // NOTE: `resume` intentionally shares the `pause` scope — both are
  // pause-state mutations and RBAC rarely needs to split them. If you
  // ever want to grant "can pause but can't resume" (or vice versa),
  // introduce a dedicated `resume` scope and update both `Scope` in
  // core/types.ts and this procedure at the same time.
  resume: scopedQueueMutation("pause")
    .input(z.object({ name: z.string() }))
    .handler(async ({ context }) => {
      const queue = context.queue!;
      return await resumeQueue(queue);
    }),

  /**
   * Bulk apply retry / remove / promote to many jobs at once.
   * Scope is checked dynamically against the action because each action
   * maps to its own scope in the Scope union.
   */
  bulk: writableQueueProcedure
    .input(
      z.object({
        name: z.string(),
        action: z.enum(["retry", "remove", "promote"]),
        ids: z.array(z.string()).optional(),
        filter: z
          .object({
            states: z.array(jobStateSchema).default([]),
            nameFilter: z.string().optional(),
          })
          .optional(),
        cap: z.number().int().positive().optional(),
      })
    )
    .handler(async ({ context, input, errors }): Promise<BulkActionResult> => {
      if (!context.scopes.has(input.action)) {
        throw errors.Forbidden({ message: `requires scope: ${input.action}` });
      }
      const queue = context.queue!;
      return await bulkAction(queue, {
        action: input.action,
        ids: input.ids,
        filter: input.filter
          ? {
              states: (input.filter.states ?? []) as JobState[],
              nameFilter: input.filter.nameFilter,
            }
          : undefined,
        cap: input.cap,
      });
    }),
};
