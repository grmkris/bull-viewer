import type { Scope, Viewer } from "@grmkris/bull-viewer-core";
/**
 * Tier 2 harness — builds a real `ViewerContext` backed by an actual
 * `redis-memory-server` + real BullMQ Queues. Use this when the procedure
 * under test exercises BullMQ behavior that no fake can simulate (Lua
 * scripts, real getJob/getJobs ordering, FlowProducer dependencies, real
 * SCAN-based search).
 *
 * For everything else, prefer the fake-queue `harness.ts` — it's
 * sub-millisecond per test.
 *
 * Usage:
 *
 *   import { call } from "@orpc/server"
 *   import { createIntegrationContext } from "./redis-harness.ts"
 *   import { queuesRouter } from "../src/routers/queues.ts"
 *
 *   let ctx: Awaited<ReturnType<typeof createIntegrationContext>>
 *   beforeAll(async () => {
 *     ctx = await createIntegrationContext({
 *       scopes: ["read", "remove"],
 *       queueNames: ["emails"],
 *     })
 *   })
 *   afterAll(async () => { await ctx.cleanup() })
 *
 *   test("...", async () => {
 *     await call(queuesRouter.list, {}, { context: ctx.context })
 *   })
 */
import {
  createTestRedisSetup,
  createTestRegistry,
  type RedisTestSetup,
} from "@grmkris/bull-viewer-test-utils";

import type { ViewerContext } from "../src/lib/context.ts";
import { silentLogger } from "../src/lib/logger.ts";

export interface CreateIntegrationContextOptions {
  scopes?: Scope[];
  viewer?: Viewer | null;
  readOnly?: boolean;
  /** Queue names to register in the real Redis. */
  queueNames: string[];
  /** Optional explicit tenant id; defaults to `"default"` to match handler.ts behaviour. */
  tenantId?: string;
}

export interface IntegrationContext {
  context: ViewerContext;
  redis: RedisTestSetup;
  cleanup: () => Promise<void>;
}

export async function createIntegrationContext(
  options: CreateIntegrationContextOptions
): Promise<IntegrationContext> {
  const redis = await createTestRedisSetup();
  const built = createTestRegistry(redis.url, options.queueNames);

  const context: ViewerContext = {
    registry: built.registry,
    viewer: options.viewer ?? null,
    scopes: new Set(options.scopes ?? ["read"]),
    readOnly: options.readOnly ?? false,
    headers: new Headers(),
    requestId: "test-integration",
    tenantId: options.tenantId ?? "default",
    logger: silentLogger,
  };

  const cleanup = async () => {
    await built.cleanup();
    await redis.shutdown();
  };

  return { context, redis, cleanup };
}
