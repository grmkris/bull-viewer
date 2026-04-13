import type { JobListPage, JobSnapshot, JobState } from "@bull-viewer/core";
import {
  listJobs as coreListJobs,
  getJob as coreGetJob,
  retryJob,
  removeJob,
  promoteJob,
  getFlow,
  findFlowRoot,
  type FlowGraph,
} from "@bull-viewer/core/server";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { readProcedure, writableProcedure } from "../lib/orpc.ts";
import { getQueueOr404, jobStateSchema } from "./queues.ts";

export const jobsRouter = {
  list: readProcedure
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
      const queue = getQueueOr404(context, input.name);
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

  get: readProcedure
    .input(z.object({ name: z.string(), id: z.string() }))
    .handler(async ({ context, input }): Promise<{ job: JobSnapshot }> => {
      const queue = getQueueOr404(context, input.name);
      const job = await coreGetJob(queue, input.id);
      if (!job) {
        throw new ORPCError("NOT_FOUND", {
          message: `job not found: ${input.id}`,
        });
      }
      return { job };
    }),

  /**
   * Single-job retry / remove / promote. The scope to check is derived
   * from the action since each maps 1:1 to a Scope name.
   */
  action: writableProcedure
    .input(
      z.object({
        name: z.string(),
        id: z.string(),
        action: z.enum(["retry", "remove", "promote"]),
      })
    )
    .handler(async ({ context, input }) => {
      if (!context.scopes.has(input.action)) {
        throw new ORPCError("FORBIDDEN", {
          message: `requires scope: ${input.action}`,
        });
      }
      const queue = getQueueOr404(context, input.name);
      const result =
        input.action === "retry"
          ? await retryJob(queue, input.id)
          : input.action === "remove"
            ? await removeJob(queue, input.id)
            : await promoteJob(queue, input.id);
      if (!result.ok) {
        throw new ORPCError("NOT_FOUND", {
          message: result.reason ?? "action failed",
        });
      }
      return { ok: true as const };
    }),

  flow: readProcedure
    .input(z.object({ name: z.string(), id: z.string() }))
    .handler(async ({ context, input }): Promise<FlowGraph> => {
      const queue = getQueueOr404(context, input.name);
      const rootId = (await findFlowRoot(queue, input.id)) ?? input.id;
      const flow = await getFlow(queue, rootId);
      if (!flow) {
        throw new ORPCError("NOT_FOUND", { message: "flow not found" });
      }
      return flow;
    }),
};
