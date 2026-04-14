import { afterAll, beforeAll, describe, expect, test } from "bun:test";

/**
 * Integration tests for the events multiplexer. Validates ref-counting +
 * scopeKey isolation against a real Redis using BullMQ's QueueEvents.
 */
import {
  createTestRedisSetup,
  createTestRegistry,
  waitFor,
  type RedisTestSetup,
} from "@grmkris/bull-viewer-test-utils";

import type { QueueRegistry } from "../server.ts";
import { subscribeQueueEvents, type QueueEventMessage } from "./events.ts";

let redis: RedisTestSetup;
let registry: QueueRegistry;
let cleanup: (() => Promise<void>) | null = null;
const QUEUE = `test-events-${crypto.randomUUID().slice(0, 8)}`;

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

describe("subscribeQueueEvents", () => {
  test("delivers a `waiting` event when a job is enqueued", async () => {
    const received: QueueEventMessage[] = [];
    const unsub = subscribeQueueEvents(QUEUE, registry.connection, (msg) => {
      received.push(msg);
    });
    try {
      // Tiny delay so the QueueEvents XREAD stream has a chance to start
      // reading before we enqueue. Without this, the very first event can
      // be missed when the test races subscription setup vs job enqueue.
      await new Promise((r) => setTimeout(r, 100));
      await getQueue().add("event-target", { v: 1 });
      await waitFor(() => received.some((m) => m.type === "waiting"), {
        timeout: 3000,
        message: "no waiting event received",
      });
      const waiting = received.find((m) => m.type === "waiting");
      expect(waiting?.queue).toBe(QUEUE);
      expect(waiting?.jobId).toBeDefined();
    } finally {
      unsub();
    }
  });

  test("two subscribers in the same scope both receive events (refcounted)", async () => {
    const a: QueueEventMessage[] = [];
    const b: QueueEventMessage[] = [];
    const unsubA = subscribeQueueEvents(QUEUE, registry.connection, (m) =>
      a.push(m)
    );
    const unsubB = subscribeQueueEvents(QUEUE, registry.connection, (m) =>
      b.push(m)
    );
    try {
      await new Promise((r) => setTimeout(r, 100));
      await getQueue().add("multi-sub", { v: 2 });
      await waitFor(() => a.length > 0 && b.length > 0, {
        timeout: 3000,
        message: "both subscribers should have received an event",
      });
      expect(a.length).toBeGreaterThan(0);
      expect(b.length).toBeGreaterThan(0);
    } finally {
      unsubA();
      unsubB();
    }
  });

  test("unsubscribing one subscriber does not affect the other", async () => {
    const a: QueueEventMessage[] = [];
    const b: QueueEventMessage[] = [];
    const unsubA = subscribeQueueEvents(QUEUE, registry.connection, (m) =>
      a.push(m)
    );
    const unsubB = subscribeQueueEvents(QUEUE, registry.connection, (m) =>
      b.push(m)
    );
    unsubA();
    try {
      await new Promise((r) => setTimeout(r, 100));
      await getQueue().add("only-b", { v: 3 });
      await waitFor(() => b.length > 0, {
        timeout: 3000,
        message: "remaining subscriber should still receive events",
      });
      expect(b.length).toBeGreaterThan(0);
      // A had been unsubscribed before the event was emitted.
      const sizeBeforeWait = a.length;
      await new Promise((r) => setTimeout(r, 200));
      expect(a.length).toBe(sizeBeforeWait);
    } finally {
      unsubB();
    }
  });

  test("scopeKey isolation: same queue name + different scopes are independent", async () => {
    // Both scopes target the SAME real Redis queue, but the multiplexer
    // tracks them under distinct keys (`scopeA::QUEUE` vs `scopeB::QUEUE`).
    // Each gets its own underlying QueueEvents subscription.
    const inA: QueueEventMessage[] = [];
    const inB: QueueEventMessage[] = [];
    const unsubA = subscribeQueueEvents(
      QUEUE,
      registry.connection,
      (m) => inA.push(m),
      "scope-a"
    );
    const unsubB = subscribeQueueEvents(
      QUEUE,
      registry.connection,
      (m) => inB.push(m),
      "scope-b"
    );
    try {
      await new Promise((r) => setTimeout(r, 100));
      await getQueue().add("scoped", { v: 4 });
      await waitFor(() => inA.length > 0 && inB.length > 0, {
        timeout: 3000,
        message: "both scopes should observe the event independently",
      });
    } finally {
      unsubA();
      unsubB();
    }
  });
});
