import { afterAll, beforeAll, describe, expect, test } from "bun:test";

/**
 * Integration test for the metrics collector + reader. Spins up a passing
 * worker, processes jobs, then asserts that `readMetrics` returns buckets
 * with non-zero `completed` counts populated by the collector's
 * QueueEvents listener.
 */
import {
  createPassingWorker,
  createTestRedisSetup,
  createTestRegistry,
  waitFor,
  type RedisTestSetup,
} from "@grmkris/bull-viewer-test-utils";
import type { Worker } from "bullmq";

import type { QueueRegistry } from "../server.ts";
import { createMetricsCollector, readMetrics } from "./metrics.ts";

let redis: RedisTestSetup;
let registry: QueueRegistry;
let cleanup: (() => Promise<void>) | null = null;
let worker: Worker | null = null;
let collector: { stop: () => Promise<void> } | null = null;
const QUEUE = `test-metrics-${crypto.randomUUID().slice(0, 8)}`;

beforeAll(async () => {
  redis = await createTestRedisSetup();
  const built = createTestRegistry(redis.url, [QUEUE]);
  registry = built.registry;
  cleanup = built.cleanup;
});

afterAll(async () => {
  if (collector) await collector.stop();
  if (worker) await worker.close();
  if (cleanup) await cleanup();
  if (redis) await redis.shutdown();
});

describe("metrics collector + readMetrics", () => {
  test("readMetrics returns one bucket per minute in the requested range", async () => {
    const result = await readMetrics(registry.connection, QUEUE, {
      range: "15m",
    });
    // 15-minute window → exactly 15 buckets, each with ts at minute boundaries.
    expect(result.buckets.length).toBe(15);
    const first = result.buckets[0]!;
    expect(first.ts).toBeGreaterThan(0);
    expect(first.completed).toBe(0);
    expect(first.failed).toBe(0);
  });

  test("collector records completed jobs against the current minute", async () => {
    // Start the collector — it subscribes to QueueEvents and writes to
    // Redis hashes on every completed/failed event.
    const c = createMetricsCollector({
      connection: registry.connection,
      queues: () => registry.getAll(),
    });
    await c.start();
    collector = c;

    // Process a few jobs through a passing worker.
    worker = createPassingWorker(redis.url, QUEUE, { ok: true });
    const queue = registry.getQueue(QUEUE);
    if (!queue) throw new Error("queue missing");
    await queue.add("metric-job-1", { i: 1 });
    await queue.add("metric-job-2", { i: 2 });
    await queue.add("metric-job-3", { i: 3 });

    // Wait for the collector to observe + write the completions. 10 s
    // gives warm-cache CI runners plenty of headroom on top of the usual
    // sub-second redis-memory-server path.
    await waitFor(
      async () => {
        const result = await readMetrics(registry.connection, QUEUE, {
          range: "15m",
        });
        const total = result.buckets.reduce((s, b) => s + b.completed, 0);
        return total >= 3;
      },
      {
        timeout: 10_000,
        interval: 100,
        message: "collector did not record 3 completions in time",
      }
    );

    const result = await readMetrics(registry.connection, QUEUE, {
      range: "15m",
    });
    const totalCompleted = result.buckets.reduce((s, b) => s + b.completed, 0);
    const totalFailed = result.buckets.reduce((s, b) => s + b.failed, 0);
    expect(totalCompleted).toBeGreaterThanOrEqual(3);
    expect(totalFailed).toBe(0);
  });
});
