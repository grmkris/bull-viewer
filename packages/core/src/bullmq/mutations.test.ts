/**
 * Integration tests for `retryJob`, `removeJob`, `promoteJob`,
 * `pauseQueue`, `resumeQueue`, and `bulkAction` against a real
 * `redis-memory-server`. Workers are spun up inline to deterministically
 * produce failed jobs we can act on.
 */
import {
  createFailingWorker,
  createTestRedisSetup,
  createTestRegistry,
  drainAndCloseRegistry,
  waitFor,
  type RedisTestSetup,
} from "@grmkris/bull-viewer-test-utils";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Worker } from "bullmq";
import type { QueueRegistry } from "../server.ts";
import {
  bulkAction,
  pauseQueue,
  promoteJob,
  removeJob,
  resumeQueue,
  retryJob,
} from "./mutations.ts";

let redis: RedisTestSetup;
let registry: QueueRegistry;
let failingWorker: Worker | null = null;
const QUEUE = `test-mutations-${crypto.randomUUID().slice(0, 8)}`;

beforeAll(async () => {
  redis = await createTestRedisSetup();
  registry = createTestRegistry(redis.url, [QUEUE]).registry;
});

afterAll(async () => {
  if (failingWorker) await failingWorker.close();
  if (registry) await drainAndCloseRegistry(registry);
  if (redis) await redis.shutdown();
});

function getQueue() {
  const q = registry.getQueue(QUEUE);
  if (!q) throw new Error(`queue ${QUEUE} not registered`);
  return q;
}

describe("pauseQueue / resumeQueue", () => {
  test("pause flips isPaused, resume restores it", async () => {
    const queue = getQueue();
    expect(await queue.isPaused()).toBe(false);
    const r1 = await pauseQueue(queue);
    expect(r1.ok).toBe(true);
    expect(await queue.isPaused()).toBe(true);
    const r2 = await resumeQueue(queue);
    expect(r2.ok).toBe(true);
    expect(await queue.isPaused()).toBe(false);
  });
});

describe("retryJob", () => {
  test("returns ok:false with reason for an unknown id", async () => {
    const result = await retryJob(getQueue(), "missing-job-id");
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/not found/i);
  });

  test("retries an actually-failed job", async () => {
    const queue = getQueue();
    // Pause so the worker doesn't drain new jobs while we set up the failing one.
    await queue.pause();
    failingWorker = createFailingWorker(redis.url, QUEUE, "boom");
    const job = await queue.add(
      "will-fail",
      {},
      { attempts: 1, jobId: "retry-target" },
    );
    await queue.resume();
    // Wait for the worker to mark it failed.
    await waitFor(async () => (await job.getState()) === "failed", {
      timeout: 5000,
      message: "job did not fail in time",
    });

    const before = await job.getState();
    expect(before).toBe("failed");

    // Closing the worker so retry doesn't immediately re-fail and race the assertion.
    await failingWorker.close();
    failingWorker = null;

    const result = await retryJob(queue, String(job.id));
    expect(result.ok).toBe(true);
    // After retry, the job should be back in waiting (or wherever a fresh job lands).
    const after = await job.getState();
    expect(["waiting", "active", "delayed", "prioritized"]).toContain(after);
  });
});

describe("removeJob", () => {
  test("returns ok:false for unknown id", async () => {
    const result = await removeJob(getQueue(), "missing-job-id");
    expect(result.ok).toBe(false);
  });

  test("removes a real job", async () => {
    const queue = getQueue();
    const job = await queue.add("to-remove", {}, { jobId: "remove-target" });
    const result = await removeJob(queue, String(job.id));
    expect(result.ok).toBe(true);
    expect(await queue.getJob(String(job.id))).toBeUndefined();
  });
});

describe("promoteJob", () => {
  test("promotes a delayed job to waiting", async () => {
    const queue = getQueue();
    const job = await queue.add(
      "delayed-task",
      {},
      { delay: 60_000, jobId: "promote-target" },
    );
    expect(await job.getState()).toBe("delayed");
    const result = await promoteJob(queue, String(job.id));
    expect(result.ok).toBe(true);
    // Promoted jobs are not delayed anymore.
    expect(await job.getState()).not.toBe("delayed");
  });
});

describe("bulkAction", () => {
  test("explicit ids: each id triggers the chosen action", async () => {
    const queue = getQueue();
    const j1 = await queue.add("bulk-1", {}, { jobId: "bulk-id-1" });
    const j2 = await queue.add("bulk-2", {}, { jobId: "bulk-id-2" });
    const j3 = await queue.add("bulk-3", {}, { jobId: "bulk-id-3" });
    const result = await bulkAction(queue, {
      action: "remove",
      ids: [String(j1.id), String(j2.id), String(j3.id)],
    });
    expect(result.ok).toBe(true);
    expect(result.attempted).toBe(3);
    expect(result.succeeded).toBe(3);
    expect(result.failed).toBe(0);
    expect(await queue.getJob("bulk-id-1")).toBeUndefined();
    expect(await queue.getJob("bulk-id-2")).toBeUndefined();
    expect(await queue.getJob("bulk-id-3")).toBeUndefined();
  });

  test("filter mode: scans the requested states", async () => {
    const queue = getQueue();
    await queue.add("filter-bulk-a", {}, { jobId: "filter-bulk-id-a" });
    await queue.add("filter-bulk-b", {}, { jobId: "filter-bulk-id-b" });
    const result = await bulkAction(queue, {
      action: "remove",
      filter: { states: ["waiting"], nameFilter: "filter-bulk" },
      cap: 50,
    });
    expect(result.attempted).toBeGreaterThanOrEqual(2);
    expect(result.failed).toBe(0);
  });

  test("cap limits the number of operations", async () => {
    const queue = getQueue();
    const ids = ["cap-a", "cap-b", "cap-c", "cap-d", "cap-e"];
    for (const id of ids) {
      await queue.add("cap-job", {}, { jobId: id });
    }
    const result = await bulkAction(queue, {
      action: "remove",
      ids,
      cap: 2,
    });
    expect(result.attempted).toBe(2);
    // Tear down the unprocessed ones so they don't leak into other tests
    for (const id of ids) {
      const j = await queue.getJob(id);
      if (j) await j.remove();
    }
  });
});
