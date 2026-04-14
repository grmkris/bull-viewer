import {
  readMetrics,
  type MetricBucket,
} from "@grmkris/bull-viewer-core/server";
import { z } from "zod";

import { queueProcedure } from "../lib/orpc.ts";

const RANGE = z.enum(["15m", "1h", "6h", "24h", "7d"]);

export const metricsRouter = {
  get: queueProcedure
    .input(
      z.object({
        name: z.string(),
        range: RANGE.default("1h"),
      })
    )
    .handler(
      async ({ context, input }): Promise<{ buckets: MetricBucket[] }> => {
        // queueProcedure already resolved ctx.queue and 404'd if missing
        return await readMetrics(context.registry.connection, input.name, {
          range: input.range,
        });
      }
    ),
};
