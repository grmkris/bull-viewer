import { afterAll, beforeAll, describe, expect, test } from "bun:test";

/**
 * Integration test for `queues.bulk` against real BullMQ. Verifies that
 * the oRPC procedure's wiring of `Promise.allSettled` semantics + per-id
 * results works end-to-end with actual jobs, scope enforcement, and
 * readOnly mode rejection.
 */
import { call, ORPCError } from "@orpc/server";

import { queuesRouter } from "../src/routers/queues.ts";
import {
  createIntegrationContext,
  type IntegrationContext,
} from "./redis-harness.ts";

const QUEUE = `test-bulk-${crypto.randomUUID().slice(0, 8)}`;
let ctx: IntegrationContext;

beforeAll(async () => {
  ctx = await createIntegrationContext({
    scopes: ["read", "retry", "remove", "promote"],
    queueNames: [QUEUE],
  });
});

afterAll(async () => {
  if (ctx) await ctx.cleanup();
});

function getQueue() {
  const q = ctx.context.registry.getQueue(QUEUE);
  if (!q) throw new Error(`queue ${QUEUE} not registered`);
  return q;
}

describe("queues.bulk — explicit ids", () => {
  test("removes every job listed", async () => {
    const queue = getQueue();
    const j1 = await queue.add("bulk-rm-1", {}, { jobId: "rm-1" });
    const j2 = await queue.add("bulk-rm-2", {}, { jobId: "rm-2" });
    const j3 = await queue.add("bulk-rm-3", {}, { jobId: "rm-3" });

    const result = await call(
      queuesRouter.bulk,
      {
        name: QUEUE,
        action: "remove",
        ids: [String(j1.id), String(j2.id), String(j3.id)],
      },
      { context: ctx.context }
    );

    expect(result.ok).toBe(true);
    expect(result.attempted).toBe(3);
    expect(result.succeeded).toBe(3);
    expect(result.failed).toBe(0);
    expect(await queue.getJob("rm-1")).toBeUndefined();
    expect(await queue.getJob("rm-2")).toBeUndefined();
    expect(await queue.getJob("rm-3")).toBeUndefined();
  });

  test("partial failure: unknown id is reported in errors[]", async () => {
    const queue = getQueue();
    const j1 = await queue.add("bulk-mix-1", {}, { jobId: "mix-1" });

    const result = await call(
      queuesRouter.bulk,
      {
        name: QUEUE,
        action: "remove",
        ids: [String(j1.id), "nonexistent-mix-2"],
      },
      { context: ctx.context }
    );

    expect(result.attempted).toBe(2);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.id).toBe("nonexistent-mix-2");
    expect(result.errors[0]?.reason).toMatch(/not found/i);
  });

  test("cap caps the number of operations", async () => {
    const queue = getQueue();
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const j = await queue.add("bulk-cap", {}, { jobId: `cap-${i}` });
      ids.push(String(j.id));
    }
    const result = await call(
      queuesRouter.bulk,
      {
        name: QUEUE,
        action: "remove",
        ids,
        cap: 2,
      },
      { context: ctx.context }
    );
    expect(result.attempted).toBe(2);
    // Tear down the rest so they don't leak between tests.
    for (let i = 0; i < 5; i++) {
      const j = await queue.getJob(`cap-${i}`);
      if (j) await j.remove();
    }
  });
});

describe("queues.bulk — filter mode", () => {
  test("scans waiting jobs and applies the action with a name filter", async () => {
    const queue = getQueue();
    await queue.add("filter-x", {}, { jobId: "filter-x-1" });
    await queue.add("filter-y", {}, { jobId: "filter-y-1" });
    await queue.add("unrelated", {}, { jobId: "unrelated-1" });

    const result = await call(
      queuesRouter.bulk,
      {
        name: QUEUE,
        action: "remove",
        filter: { states: ["waiting"], nameFilter: "filter-" },
        cap: 50,
      },
      { context: ctx.context }
    );

    expect(result.failed).toBe(0);
    expect(result.attempted).toBeGreaterThanOrEqual(2);
    // The unrelated job survives.
    expect(await queue.getJob("unrelated-1")).toBeDefined();
    await (await queue.getJob("unrelated-1"))?.remove();
  });
});

describe("queues.bulk — auth gates", () => {
  test("rejects when the chosen action's scope is missing", async () => {
    const noScope = await createIntegrationContext({
      // `read` only — the dynamic per-action check on `remove` should fail.
      scopes: ["read"],
      queueNames: [QUEUE],
    });
    try {
      try {
        await call(
          queuesRouter.bulk,
          {
            name: QUEUE,
            action: "remove",
            ids: ["whatever"],
          },
          { context: noScope.context }
        );
        expect.unreachable();
      } catch (err) {
        expect(err).toBeInstanceOf(ORPCError);
        // Code casing varies between the typed `.errors()` map (PascalCase
        // — "Forbidden") and bare `new ORPCError("FORBIDDEN", …)` throws.
        // The UI's onError handler accepts both, so tests should too.
        const code = (err as ORPCError<string, unknown>).code;
        expect(code).toMatch(/^Forbidden$|^FORBIDDEN$/);
      }
    } finally {
      await noScope.cleanup();
    }
  });

  test("rejects in readOnly mode", async () => {
    const ro = await createIntegrationContext({
      scopes: ["read", "remove"],
      readOnly: true,
      queueNames: [QUEUE],
    });
    try {
      try {
        await call(
          queuesRouter.bulk,
          {
            name: QUEUE,
            action: "remove",
            ids: ["whatever"],
          },
          { context: ro.context }
        );
        expect.unreachable();
      } catch (err) {
        expect(err).toBeInstanceOf(ORPCError);
        const code = (err as ORPCError<string, unknown>).code;
        expect(code).toMatch(
          /^Read_?Only$|^READ_?ONLY$|^Forbidden$|^FORBIDDEN$/i
        );
      }
    } finally {
      await ro.cleanup();
    }
  });
});
