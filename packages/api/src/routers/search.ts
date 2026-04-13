import {
  RedisScanSearchProvider,
  type SearchResult,
} from "@bull-viewer/core/server";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { readProcedure } from "../lib/orpc.ts";
import { jobStateSchema } from "./queues.ts";

/**
 * NOTE: The previous `setSearchProvider(provider)` module-level setter was
 * removed because it had a dual-package hazard — importing `@bull-viewer/api`
 * twice (e.g. compiled + source in the same process) would create two
 * independent `providerOverride` singletons and the wrong one would win.
 *
 * Hosts now inject a custom `SearchProvider` via `createQueuesApiHandler({
 * searchProvider })`. It flows through `ViewerContext.searchProvider` and
 * is read here per request. Default is `RedisScanSearchProvider`.
 */

export const searchRouter = {
  jobs: readProcedure
    .input(
      z.object({
        name: z.string(),
        query: z.string(),
        states: z.array(jobStateSchema).optional(),
        limit: z.number().int().min(1).max(100).default(20),
      })
    )
    .handler(async ({ context, input }): Promise<SearchResult> => {
      const queue = context.registry.getQueue(input.name);
      if (!queue) {
        throw new ORPCError("NOT_FOUND", {
          message: `queue not found: ${input.name}`,
        });
      }
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
