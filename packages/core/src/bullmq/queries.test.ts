import { afterAll, beforeAll, describe, expect, test } from "bun:test";

/**
 * Integration tests against a real `redis-memory-server`. Validates that
 * `getQueueSnapshot`, `listJobs`, `getJob` correctly map BullMQ Queue API
 * results into our snapshot shapes — the part that no fake can cover
 * because BullMQ uses Lua scripts internally.
 */
import {
  createTestRedisSetup,
  createTestRegistry,
  type RedisTestSetup,
} from "@grmkris/bull-viewer-test-utils";

import type { QueueRegistry } from "../server.ts";
import { getJob, getQueueSnapshot, listJobs } from "./queries.ts";

// One redis-memory-server per file. Bun test isolates module state per
// file, so a "shared" redis pattern across files doesn't actually share —
// per-file boot is ~1s once the binary is cached.
let redis: RedisTestSetup;
let registry: QueueRegistry;
let cleanup: (() => Promise<void>) | null = null;
const QUEUE = `test-queries-${crypto.randomUUID().slice(0, 8)}`;

beforeAll(async () => {
  redis = await createTestRedisSetup();
  const built = createTestRegistry(redis.url, [QUEUE]);
  registry = built.registry;
  cleanup = built.cleanup;
});

afterAll(async () => {
  if (cleanup) await cleanup();
  if (redis) await redis.shutdown();
});

function getQueue() {
  const q = registry.getQueue(QUEUE);
  if (!q) throw new Error(`queue ${QUEUE} not registered`);
  return q;
}

describe("getQueueSnapshot", () => {
  test("returns a fully-populated snapshot for an empty queue", async () => {
    const snap = await getQueueSnapshot(getQueue());
    expect(snap.name).toBe(QUEUE);
    expect(snap.isPaused).toBe(false);
    // Every state key is present and zero-initialised — the normalize step
    // must guarantee this even when BullMQ omits absent keys.
    expect(snap.counts.waiting).toBe(0);
    expect(snap.counts.active).toBe(0);
    expect(snap.counts.completed).toBe(0);
    expect(snap.counts.failed).toBe(0);
    expect(snap.counts.delayed).toBe(0);
    expect(snap.counts.paused).toBe(0);
    expect(snap.counts.prioritized).toBe(0);
    expect(snap.counts["waiting-children"]).toBe(0);
  });

  test("counts waiting jobs after enqueue", async () => {
    const queue = getQueue();
    await queue.add("q1", { hello: "world" });
    await queue.add("q2", { hello: "world" });
    const snap = await getQueueSnapshot(queue);
    expect(snap.counts.waiting).toBeGreaterThanOrEqual(2);
  });

  test("isPaused tracks queue.pause() / queue.resume()", async () => {
    const queue = getQueue();
    await queue.pause();
    expect((await getQueueSnapshot(queue)).isPaused).toBe(true);
    await queue.resume();
    expect((await getQueueSnapshot(queue)).isPaused).toBe(false);
  });
});

describe("listJobs", () => {
  test("returns enqueued jobs in waiting state with correct shape", async () => {
    const queue = getQueue();
    const added = await queue.add("send-welcome", { to: "alice@x.com" });
    const page = await listJobs(queue, {
      states: ["waiting"],
      start: 0,
      end: 19,
    });
    expect(page.state).toBe("waiting");
    expect(page.jobs.length).toBeGreaterThan(0);
    const found = page.jobs.find((j) => j.id === String(added.id));
    expect(found).toBeDefined();
    expect(found?.name).toBe("send-welcome");
    expect(found?.data).toEqual({ to: "alice@x.com" });
    expect(found?.failedReason).toBeNull();
    expect(found?.stacktrace).toEqual([]);
  });

  test("nameFilter filters returned jobs by substring match", async () => {
    const queue = getQueue();
    await queue.add("filter-target-foo", { v: 1 });
    await queue.add("filter-target-bar", { v: 2 });
    await queue.add("unrelated-name", { v: 3 });
    const page = await listJobs(queue, {
      states: ["waiting"],
      start: 0,
      end: 49,
      nameFilter: "filter-target",
    });
    const names = page.jobs.map((j) => j.name);
    expect(names).toContain("filter-target-foo");
    expect(names).toContain("filter-target-bar");
    expect(names).not.toContain("unrelated-name");
  });

  test("empty states defaults to ['waiting']", async () => {
    const page = await listJobs(getQueue(), {
      states: [],
      start: 0,
      end: 19,
    });
    expect(page.state).toBe("waiting");
  });
});

describe("getJob", () => {
  test("returns null for an unknown job id", async () => {
    const result = await getJob(getQueue(), "does-not-exist-9999");
    expect(result).toBeNull();
  });

  test("returns a snapshot for a real enqueued job", async () => {
    const queue = getQueue();
    const job = await queue.add(
      "single-lookup",
      { payload: { n: 42 } },
      { jobId: "fixed-id-for-lookup" }
    );
    const snap = await getJob(queue, String(job.id));
    expect(snap).not.toBeNull();
    expect(snap?.id).toBe("fixed-id-for-lookup");
    expect(snap?.name).toBe("single-lookup");
    expect(snap?.data).toEqual({ payload: { n: 42 } });
    expect(snap?.state).toBeDefined();
  });
});
