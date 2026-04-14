import { afterAll, beforeAll, describe, expect, test } from "bun:test";

/**
 * Integration test for the `search.jobs` procedure end-to-end against
 * real BullMQ — exercises the full `queueProcedure` middleware chain
 * (queue resolution + scope guard) plus the actual `RedisScanSearchProvider`.
 */
import { call } from "@orpc/server";

import { searchRouter } from "../src/routers/search.ts";
import {
  createIntegrationContext,
  type IntegrationContext,
} from "./redis-harness.ts";

const QUEUE = `test-search-${crypto.randomUUID().slice(0, 8)}`;
let ctx: IntegrationContext;

beforeAll(async () => {
  ctx = await createIntegrationContext({
    scopes: ["read"],
    queueNames: [QUEUE],
  });

  // Seed the queue with a handful of jobs so search has interesting things
  // to find.
  const queue = ctx.context.registry.getQueue(QUEUE);
  if (!queue) throw new Error("queue missing");
  await queue.add("send-welcome", { to: "alice@example.com" });
  await queue.add("send-welcome", { to: "bob@example.com" });
  await queue.add("send-receipt", { to: "carol@example.com", amount: 9.99 });
  await queue.add("generate-report", { kind: "weekly" });
  await queue.add("lookup-target", { v: 1 }, { jobId: "search-fixed-id-99" });
});

afterAll(async () => {
  if (ctx) await ctx.cleanup();
});

describe("search.jobs", () => {
  test("empty trimmed query returns the empty placeholder shape", async () => {
    const result = await call(
      searchRouter.jobs,
      { name: QUEUE, query: "   ", limit: 10 },
      { context: ctx.context }
    );
    expect(result.jobs).toEqual([]);
    expect(result.scanned).toBe(0);
  });

  test("Tier 0: looks-like-job-id query finds the deterministic job", async () => {
    const result = await call(
      searchRouter.jobs,
      { name: QUEUE, query: "search-fixed-id-99", limit: 5 },
      { context: ctx.context }
    );
    expect(result.jobs.map((j) => j.id)).toContain("search-fixed-id-99");
  });

  test("Tier 1: substring match on job name", async () => {
    const result = await call(
      searchRouter.jobs,
      { name: QUEUE, query: "send-welcome", limit: 50 },
      { context: ctx.context }
    );
    const matches = result.jobs.filter((j) => j.name === "send-welcome");
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  test("Tier 1: substring match inside job data payload", async () => {
    const result = await call(
      searchRouter.jobs,
      { name: QUEUE, query: "carol@example.com", limit: 50 },
      { context: ctx.context }
    );
    expect(result.jobs.length).toBeGreaterThan(0);
    expect(result.jobs.some((j) => j.name === "send-receipt")).toBe(true);
  });

  test("limit caps the returned set", async () => {
    const result = await call(
      searchRouter.jobs,
      { name: QUEUE, query: "send-welcome", limit: 1 },
      { context: ctx.context }
    );
    expect(result.jobs.length).toBe(1);
  });
});
