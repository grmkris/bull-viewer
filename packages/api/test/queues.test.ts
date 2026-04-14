import { describe, expect, test } from "bun:test";

import { call } from "@orpc/server";

import { queuesRouter } from "../src/routers/queues.ts";
import { createTestContext, fakeQueue } from "./harness.ts";

describe("queues.list", () => {
  test("returns snapshots for every registered queue", async () => {
    const ctx = createTestContext({
      scopes: ["read"],
      queues: {
        emails: fakeQueue({
          name: "emails",
          counts: { waiting: 5, failed: 2 },
        }),
        reports: fakeQueue({ name: "reports", counts: { completed: 12 } }),
      },
    });

    const result = await call(queuesRouter.list, {}, { context: ctx });

    expect(result.queues).toHaveLength(2);
    const emails = result.queues.find((q) => q.name === "emails");
    expect(emails?.counts.waiting).toBe(5);
    expect(emails?.counts.failed).toBe(2);
    const reports = result.queues.find((q) => q.name === "reports");
    expect(reports?.counts.completed).toBe(12);
  });

  test("returns an error placeholder for a queue whose getJobCounts throws", async () => {
    const ctx = createTestContext({
      scopes: ["read"],
      queues: {
        good: fakeQueue({ name: "good", counts: { waiting: 1 } }),
        bad: fakeQueue({
          name: "bad",
          overrides: {
            getJobCounts: (async () => {
              throw new Error("redis down");
            }) as never,
          },
        }),
      },
    });

    const result = await call(queuesRouter.list, {}, { context: ctx });

    expect(result.queues).toHaveLength(2);
    const bad = result.queues.find((q) => q.name === "bad");
    expect(bad).toBeDefined();
    // Error placeholder is a zeroed-out snapshot
    expect(bad?.counts.waiting).toBe(0);
    expect(bad?.counts.failed).toBe(0);
    expect(bad?.isPaused).toBe(false);
  });

  test("requires read scope", async () => {
    const ctx = createTestContext({
      scopes: [],
      queues: { emails: fakeQueue() },
    });
    await expect(call(queuesRouter.list, {}, { context: ctx })).rejects.toThrow(
      /forbidden|requires scope/i
    );
  });
});

describe("queues.pause / resume", () => {
  test("pause mutates queue state when scope is present", async () => {
    const queue = fakeQueue({ name: "emails" });
    const ctx = createTestContext({
      scopes: ["read", "pause"],
      queues: { emails: queue },
    });

    expect(await queue.isPaused()).toBe(false);
    await call(queuesRouter.pause, { name: "emails" }, { context: ctx });
    expect(await queue.isPaused()).toBe(true);
  });

  test("pause rejects in readOnly mode", async () => {
    const ctx = createTestContext({
      scopes: ["read", "pause"],
      readOnly: true,
      queues: { emails: fakeQueue() },
    });
    await expect(
      call(queuesRouter.pause, { name: "emails" }, { context: ctx })
    ).rejects.toThrow(/read-?only|forbidden/i);
  });

  test("pause rejects without pause scope", async () => {
    const ctx = createTestContext({
      scopes: ["read"],
      queues: { emails: fakeQueue() },
    });
    await expect(
      call(queuesRouter.pause, { name: "emails" }, { context: ctx })
    ).rejects.toThrow(/pause|forbidden/i);
  });

  test("pause rejects for an unknown queue", async () => {
    const ctx = createTestContext({
      scopes: ["read", "pause"],
      queues: { emails: fakeQueue() },
    });
    await expect(
      call(queuesRouter.pause, { name: "ghost" }, { context: ctx })
    ).rejects.toThrow(/queue not found|ghost/i);
  });
});
