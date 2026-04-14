import type {
  JobListPage,
  JobSnapshot,
  JobState,
} from "@grmkris/bull-viewer-core";
import {
  findFlowRoot,
  type FlowGraph,
  getFlow,
  getJob as coreGetJob,
  listJobs as coreListJobs,
  promoteJob,
  removeJob,
  retryJob,
} from "@grmkris/bull-viewer-core/server";
import { z } from "zod";

import { queueProcedure, writableQueueProcedure } from "../lib/orpc.ts";
import { jobStateSchema } from "./queues.ts";

export const jobsRouter = {
  list: queueProcedure
    .input(
      z.object({
        name: z.string(),
        states: z.array(jobStateSchema).optional(),
        nameFilter: z.string().optional(),
        start: z.number().int().min(0).default(0),
        end: z.number().int().min(0).default(49),
      })
    )
    .handler(async ({ context, input }): Promise<JobListPage> => {
      const queue = context.queue!;
      const states = (
        input.states?.length ? input.states : ["waiting"]
      ) as JobState[];
      return await coreListJobs(queue, {
        states,
        start: input.start,
        end: input.end,
        nameFilter: input.nameFilter,
      });
    }),

  get: queueProcedure
    .input(z.object({ name: z.string(), id: z.string() }))
    .handler(
      async ({ context, input, errors }): Promise<{ job: JobSnapshot }> => {
        const queue = context.queue!;
        const job = await coreGetJob(queue, input.id);
        if (!job) {
          throw errors.NotFound({ message: `job not found: ${input.id}` });
        }
        return { job };
      }
    ),

  /**
   * Single-job retry / remove / promote. The scope to check is derived
   * from the action since each maps 1:1 to a Scope name. Uses
   * `writableQueueProcedure` (readOnly guard + queue resolve) and then
   * checks the action-specific scope inside the handler.
   */
  action: writableQueueProcedure
    .input(
      z.object({
        name: z.string(),
        id: z.string(),
        action: z.enum(["retry", "remove", "promote"]),
      })
    )
    .handler(async ({ context, input, errors }) => {
      if (!context.scopes.has(input.action)) {
        throw errors.Forbidden({ message: `requires scope: ${input.action}` });
      }
      const queue = context.queue!;
      const result =
        input.action === "retry"
          ? await retryJob(queue, input.id)
          : input.action === "remove"
            ? await removeJob(queue, input.id)
            : await promoteJob(queue, input.id);
      if (!result.ok) {
        const reason = result.reason ?? "action failed";
        if (reason.includes("not found")) {
          throw errors.NotFound({ message: reason });
        }
        throw errors.InvalidState({ message: reason });
      }
      return { ok: true as const };
    }),

  flow: queueProcedure
    .input(z.object({ name: z.string(), id: z.string() }))
    .handler(async ({ context, input, errors }): Promise<FlowGraph> => {
      const queue = context.queue!;
      const rootId = (await findFlowRoot(queue, input.id)) ?? input.id;
      const flow = await getFlow(queue, rootId);
      if (!flow) {
        throw errors.NotFound({ message: "flow not found" });
      }
      return flow;
    }),
};
