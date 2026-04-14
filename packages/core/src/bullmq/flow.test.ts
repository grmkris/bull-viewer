import { afterAll, beforeAll, describe, expect, test } from "bun:test";

/**
 * Integration test for `getFlow` and `findFlowRoot` against real BullMQ
 * `FlowProducer`-built parent/child trees.
 */
import {
  createTestRedisSetup,
  createTestRegistry,
  type RedisTestSetup,
} from "@grmkris/bull-viewer-test-utils";
import { FlowProducer } from "bullmq";
import IORedis from "ioredis";

import type { QueueRegistry } from "../server.ts";
import { findFlowRoot, getFlow } from "./flow.ts";

let redis: RedisTestSetup;
let registry: QueueRegistry;
let cleanup: (() => Promise<void>) | null = null;
let flowProducer: FlowProducer | null = null;
let producerConnection: IORedis | null = null;
const QUEUE = `test-flow-${crypto.randomUUID().slice(0, 8)}`;

let parentJobId: string;
let childJobIds: string[] = [];

beforeAll(async () => {
  redis = await createTestRedisSetup();
  const built = createTestRegistry(redis.url, [QUEUE]);
  registry = built.registry;
  cleanup = built.cleanup;

  // FlowProducer needs its own connection — it doesn't accept a Queue.
  producerConnection = new IORedis(redis.url, { maxRetriesPerRequest: null });
  flowProducer = new FlowProducer({ connection: producerConnection });

  const tree = await flowProducer.add({
    name: "aggregate-report",
    queueName: QUEUE,
    data: { kind: "daily" },
    children: [
      {
        name: "fetch-users",
        queueName: QUEUE,
        data: { source: "db" },
      },
      {
        name: "fetch-events",
        queueName: QUEUE,
        data: { source: "events" },
      },
    ],
  });
  parentJobId = String(tree.job.id);
  childJobIds = (tree.children ?? []).map((c) => String(c.job.id));
});

afterAll(async () => {
  if (flowProducer) await flowProducer.close();
  if (producerConnection) producerConnection.disconnect();
  if (cleanup) await cleanup();
  if (redis) await redis.shutdown();
});

function getQueue() {
  const q = registry.getQueue(QUEUE);
  if (!q) throw new Error(`queue ${QUEUE} not registered`);
  return q;
}

describe("getFlow", () => {
  test("returns null for a non-existent root", async () => {
    const result = await getFlow(getQueue(), "no-such-job-id-please");
    expect(result).toBeNull();
  });

  test("walks parent → children for a real flow tree", async () => {
    const flow = await getFlow(getQueue(), parentJobId);
    expect(flow).not.toBeNull();
    expect(flow?.rootId).toBe(parentJobId);

    const ids = flow?.nodes.map((n) => n.id) ?? [];
    expect(ids).toContain(parentJobId);
    for (const childId of childJobIds) {
      expect(ids).toContain(childId);
    }
    expect(flow?.nodes.length).toBeGreaterThanOrEqual(1 + childJobIds.length);

    // Each child should have an edge from the parent.
    for (const childId of childJobIds) {
      const edge = flow?.edges.find(
        (e) => e.from === parentJobId && e.to === childId
      );
      expect(edge).toBeDefined();
    }
  });

  test("nodes carry queue name + state metadata", async () => {
    const flow = await getFlow(getQueue(), parentJobId);
    const parentNode = flow?.nodes.find((n) => n.id === parentJobId);
    expect(parentNode?.queue).toBe(QUEUE);
    expect(parentNode?.name).toBe("aggregate-report");
    expect(parentNode?.parentId).toBeNull();
    // Children have parentId pointing back at the parent.
    const childNode = flow?.nodes.find((n) => n.id === childJobIds[0]);
    expect(childNode?.parentId).toBe(parentJobId);
  });
});

describe("findFlowRoot", () => {
  test("walks upward from a child to its parent", async () => {
    if (childJobIds.length === 0) {
      throw new Error("no children seeded");
    }
    const root = await findFlowRoot(getQueue(), childJobIds[0]!);
    expect(root).toBe(parentJobId);
  });

  test("returns the same id for a job with no parent", async () => {
    const root = await findFlowRoot(getQueue(), parentJobId);
    expect(root).toBe(parentJobId);
  });

  test("returns null for an unknown id", async () => {
    const root = await findFlowRoot(getQueue(), "ghost-job-id");
    expect(root).toBeNull();
  });
});
