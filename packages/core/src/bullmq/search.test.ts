import { afterAll, beforeAll, describe, expect, test } from "bun:test";

/**
 * Integration test for the Redis SCAN-based search provider. Exercises
 * both Tier 0 (looks-like-job-id direct lookup) and Tier 1 (substring
 * scan over states).
 */
import {
  createTestRedisSetup,
  createTestRegistry,
  type RedisTestSetup,
} from "@grmkris/bull-viewer-test-utils";

import type { QueueRegistry } from "../server.ts";
import { RedisScanSearchProvider } from "./search.ts";

let redis: RedisTestSetup;
let registry: QueueRegistry;
let cleanup: (() => Promise<void>) | null = null;
const QUEUE = `test-search-${crypto.randomUUID().slice(0, 8)}`;

beforeAll(async () => {
  redis = await createTestRedisSetup();
  const built = createTestRegistry(redis.url, [QUEUE]);
  registry = built.registry;
  cleanup = built.cleanup;

  // Seed jobs with distinguishable names + payloads so substring search
  // has something to find.
  const queue = registry.getQueue(QUEUE);
  if (!queue) throw new Error("queue missing");
  await queue.add("send-welcome-email", { to: "alice@example.com" });
  await queue.add("send-welcome-email", { to: "bob@example.com" });
  await queue.add("send-receipt", { to: "carol@example.com", amount: 9.99 });
  await queue.add("generate-report", { kind: "weekly" });
  await queue.add(
    "find-by-fixed-id",
    { v: 1 },
    { jobId: "deterministic-id-42" }
  );
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

describe("RedisScanSearchProvider", () => {
  test("empty query short-circuits to empty result", async () => {
    const result = await RedisScanSearchProvider.search({
      queue: getQueue(),
      query: "   ",
    });
    expect(result.jobs).toEqual([]);
    expect(result.scanned).toBe(0);
  });

  test("Tier 0: exact id lookup hits the deterministic job", async () => {
    const result = await RedisScanSearchProvider.search({
      queue: getQueue(),
      query: "deterministic-id-42",
      limit: 5,
    });
    const ids = result.jobs.map((j) => j.id);
    expect(ids).toContain("deterministic-id-42");
  });

  test("Tier 1: substring match on job name", async () => {
    const result = await RedisScanSearchProvider.search({
      queue: getQueue(),
      query: "welcome",
      limit: 50,
    });
    const names = result.jobs.map((j) => j.name);
    // Both "send-welcome-email" inserts should be found.
    expect(
      names.filter((n) => n.includes("welcome")).length
    ).toBeGreaterThanOrEqual(2);
  });

  test("Tier 1: substring match on job data payload", async () => {
    const result = await RedisScanSearchProvider.search({
      queue: getQueue(),
      query: "carol@example.com",
      limit: 50,
    });
    expect(result.jobs.length).toBeGreaterThan(0);
    expect(result.jobs.some((j) => j.name === "send-receipt")).toBe(true);
  });

  test("limit caps the number of returned jobs", async () => {
    const result = await RedisScanSearchProvider.search({
      queue: getQueue(),
      query: "send-welcome-email",
      limit: 1,
    });
    expect(result.jobs.length).toBe(1);
  });

  test("no matches returns an empty array (not truncated)", async () => {
    const result = await RedisScanSearchProvider.search({
      queue: getQueue(),
      query: "definitely-not-a-real-job-name-anywhere",
      limit: 10,
    });
    expect(result.jobs).toEqual([]);
  });
});
