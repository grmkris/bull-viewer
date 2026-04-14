import { afterAll, beforeAll, describe, expect, test } from "bun:test";

/**
 * Multi-tenant dispatcher test. Builds two real `redis-memory-server`s,
 * wires them as separate tenants, mounts `createQueuesApiHandler`, and
 * sends real `Request`s through the Fetch-API handler — no HTTP server
 * needed, no oRPC client needed. Asserts the URL → tenant routing,
 * legacy path fallback, the meta endpoint, and 404s for unknown tenants.
 */
import {
  createTestRedisSetup,
  createTestRegistry,
  type RedisTestSetup,
} from "@grmkris/bull-viewer-test-utils";

import {
  createQueuesApiHandler,
  type Handler,
  type TenantConfig,
} from "../src/index.ts";

let redisA: RedisTestSetup;
let redisB: RedisTestSetup;
let cleanupA: (() => Promise<void>) | null = null;
let cleanupB: (() => Promise<void>) | null = null;
let handler: Handler;

const QUEUE_A = `tenant-a-${crypto.randomUUID().slice(0, 8)}`;
const QUEUE_B = `tenant-b-${crypto.randomUUID().slice(0, 8)}`;
const BASE_PATH = "/api";

beforeAll(async () => {
  redisA = await createTestRedisSetup();
  redisB = await createTestRedisSetup();

  const a = createTestRegistry(redisA.url, [QUEUE_A]);
  const b = createTestRegistry(redisB.url, [QUEUE_B]);
  cleanupA = a.cleanup;
  cleanupB = b.cleanup;

  // Seed each tenant's queue with a couple of jobs so list calls return
  // distinguishable results.
  const queueA = a.registry.getQueue(QUEUE_A);
  const queueB = b.registry.getQueue(QUEUE_B);
  if (!(queueA && queueB)) throw new Error("seed queues missing");
  await queueA.add("a-job-1", { side: "alpha" });
  await queueA.add("a-job-2", { side: "alpha" });
  await queueB.add("b-job-1", { side: "beta" });
  await queueB.add("b-job-2", { side: "beta" });
  await queueB.add("b-job-3", { side: "beta" });

  const tenants: Record<string, TenantConfig> = {
    "tenant-a": { label: "Tenant A", registry: a.registry },
    "tenant-b": { label: "Tenant B", registry: b.registry },
  };

  handler = createQueuesApiHandler({
    tenants,
    defaultTenant: "tenant-a",
    basePath: BASE_PATH,
    // No `authorize` → context defaults to read-only scopes, which is
    // fine for `queues.list`.
  });
});

afterAll(async () => {
  if (cleanupA) await cleanupA();
  if (cleanupB) await cleanupB();
  if (redisA) await redisA.shutdown();
  if (redisB) await redisB.shutdown();
});

async function call(
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; body: unknown }> {
  const url = `http://localhost${BASE_PATH}${path}`;
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.headers = { "content-type": "application/json" };
    init.body = JSON.stringify(body);
  }
  const res = await handler(new Request(url, init));
  let parsed: unknown;
  try {
    parsed = await res.json();
  } catch {
    parsed = null;
  }
  return { status: res.status, body: parsed };
}

describe("/api/tenants meta endpoint", () => {
  test("lists every tenant with id, label, queueCount + default", async () => {
    const result = await call("GET", "/tenants");
    expect(result.status).toBe(200);
    const body = result.body as {
      tenants: { id: string; label: string; queueCount: number }[];
      default: string;
    };
    expect(body.default).toBe("tenant-a");
    expect(body.tenants).toHaveLength(2);
    const a = body.tenants.find((t) => t.id === "tenant-a");
    const b = body.tenants.find((t) => t.id === "tenant-b");
    expect(a?.label).toBe("Tenant A");
    expect(a?.queueCount).toBe(1);
    expect(b?.label).toBe("Tenant B");
    expect(b?.queueCount).toBe(1);
  });
});

describe("tenant prefix routing", () => {
  test("tenant-a/rpc/queues/list returns only A's queues", async () => {
    const result = await call("POST", "/tenants/tenant-a/rpc/queues/list", {
      json: null,
    });
    expect(result.status).toBe(200);
    // RPC wire format wraps the response in { json: ... }
    const body = result.body as { json: { queues: { name: string }[] } };
    const names = body.json.queues.map((q) => q.name);
    expect(names).toEqual([QUEUE_A]);
  });

  test("tenant-b/rpc/queues/list returns only B's queues", async () => {
    const result = await call("POST", "/tenants/tenant-b/rpc/queues/list", {
      json: null,
    });
    expect(result.status).toBe(200);
    const body = result.body as { json: { queues: { name: string }[] } };
    const names = body.json.queues.map((q) => q.name);
    expect(names).toEqual([QUEUE_B]);
  });

  test("each tenant sees its own job counts", async () => {
    const a = await call("POST", "/tenants/tenant-a/rpc/queues/list", {
      json: null,
    });
    const b = await call("POST", "/tenants/tenant-b/rpc/queues/list", {
      json: null,
    });
    const aBody = a.body as {
      json: { queues: { counts: { waiting: number } }[] };
    };
    const bBody = b.body as {
      json: { queues: { counts: { waiting: number } }[] };
    };
    // Tenant A was seeded with 2 jobs, B with 3.
    expect(aBody.json.queues[0]?.counts.waiting).toBe(2);
    expect(bBody.json.queues[0]?.counts.waiting).toBe(3);
  });
});

describe("legacy path fallback", () => {
  test("/rpc/queues/list (no tenant prefix) routes to defaultTenant", async () => {
    const result = await call("POST", "/rpc/queues/list", { json: null });
    expect(result.status).toBe(200);
    const body = result.body as { json: { queues: { name: string }[] } };
    // Default tenant is tenant-a, so the legacy path should expose A's queue.
    expect(body.json.queues.map((q) => q.name)).toEqual([QUEUE_A]);
  });
});

describe("unknown tenant", () => {
  test("returns 404 with a clear error", async () => {
    const result = await call(
      "POST",
      "/tenants/does-not-exist/rpc/queues/list",
      { json: null }
    );
    expect(result.status).toBe(404);
    const body = result.body as { error: string; known: string[] };
    expect(body.error).toMatch(/unknown tenant/i);
    expect(body.known).toEqual(["tenant-a", "tenant-b"]);
  });
});
