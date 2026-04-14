import {
  RedisScanSearchProvider,
  type SearchResult,
} from "@bull-viewer/core/server";
import { z } from "zod";

import { queueProcedure } from "../lib/orpc.ts";
import { jobStateSchema } from "./queues.ts";

/**
 * NOTE: The previous `setSearchProvider(provider)` module-level setter was
 * removed because it had a dual-package hazard. Hosts now inject a custom
 * `SearchProvider` via `createQueuesApiHandler({ searchProvider })`; it
 * flows through `ViewerContext.searchProvider` and is read here per
 * request. Default is `RedisScanSearchProvider`.
 */
export const searchRouter = {
  jobs: queueProcedure
    .input(
      z.object({
        name: z.string(),
        query: z.string(),
        states: z.array(jobStateSchema).optional(),
        limit: z.number().int().min(1).max(100).default(20),
      })
    )
    .handler(async ({ context, input }): Promise<SearchResult> => {
      // queueProcedure resolves ctx.queue via requireQueueMw; the `!` is
      // safe because the middleware throws QueueMissing otherwise.
      const queue = context.queue!;
      const trimmed = input.query.trim();
      if (!trimmed) {
        return { jobs: [], truncated: false, scanned: 0, durationMs: 0 };
      }
      const provider = context.searchProvider ?? RedisScanSearchProvider;
      return await provider.search({
        queue,
        query: trimmed,
        states: input.states,
        limit: input.limit,
      });
    }),
};
