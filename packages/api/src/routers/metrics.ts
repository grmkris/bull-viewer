import { readMetrics, type MetricBucket } from "@bull-viewer/core/server";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { readProcedure } from "../lib/orpc.ts";

const RANGE = z.enum(["15m", "1h", "6h", "24h", "7d"]);

export const metricsRouter = {
  get: readProcedure
    .input(
      z.object({
        name: z.string(),
        range: RANGE.default("1h"),
      })
    )
    .handler(
      async ({ context, input }): Promise<{ buckets: MetricBucket[] }> => {
        if (!context.registry.getQueue(input.name)) {
          throw new ORPCError("NOT_FOUND", {
            message: `queue not found: ${input.name}`,
          });
        }
        return await readMetrics(context.registry.connection, input.name, {
          range: input.range,
        });
      }
    ),
};
