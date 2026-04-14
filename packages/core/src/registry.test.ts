/**
 * Pure unit tests for the registry cache key + identity-based caching.
 *
 * These don't need a real Redis: `new IORedis(...)` is lazy and doesn't
 * connect until the first command, and `deriveCacheKey` only looks at
 * `connection.options` / object identity. Tests run in milliseconds.
 */
import { afterEach, describe, expect, test } from "bun:test";

import IORedis from "ioredis";

import { closeAllRegistries, createRegistry } from "./registry.ts";

afterEach(async () => {
  await closeAllRegistries();
});

describe("createRegistry — caching", () => {
  test("returns the same registry for two equivalent option objects", () => {
    const a = createRegistry({
      connection: { host: "localhost", port: 6379, db: 0 },
      queues: ["a", "b"],
    });
    const b = createRegistry({
      connection: { host: "localhost", port: 6379, db: 0 },
      queues: ["a", "b"],
    });
    expect(a).toBe(b);
    expect(a.cacheKey).toBe(b.cacheKey);
  });

  test("queue order is normalized — [a,b] and [b,a] hit the same cache entry", () => {
    const ab = createRegistry({
      connection: { host: "localhost", port: 6379, db: 0 },
      queues: ["a", "b"],
    });
    const ba = createRegistry({
      connection: { host: "localhost", port: 6379, db: 0 },
      queues: ["b", "a"],
    });
    expect(ab).toBe(ba);
  });

  test("different host → different registry", () => {
    const r1 = createRegistry({
      connection: { host: "host-a", port: 6379, db: 0 },
      queues: ["q"],
    });
    const r2 = createRegistry({
      connection: { host: "host-b", port: 6379, db: 0 },
      queues: ["q"],
    });
    expect(r1).not.toBe(r2);
    expect(r1.cacheKey).not.toBe(r2.cacheKey);
  });

  test("different queues → different registry", () => {
    const r1 = createRegistry({
      connection: { host: "localhost", port: 6379, db: 0 },
      queues: ["a"],
    });
    const r2 = createRegistry({
      connection: { host: "localhost", port: 6379, db: 0 },
      queues: ["b"],
    });
    expect(r1).not.toBe(r2);
  });

  test("explicit cacheKey override", () => {
    const r1 = createRegistry({
      connection: { host: "localhost" },
      queues: ["x"],
      cacheKey: "custom-id",
    });
    const r2 = createRegistry({
      // Different shape, same explicit key → same cache entry.
      connection: { host: "totally-different" },
      queues: ["does", "not", "matter"],
      cacheKey: "custom-id",
    });
    expect(r1).toBe(r2);
    expect(r1.cacheKey).toBe("custom-id");
  });
});

describe("createRegistry — IORedis identity", () => {
  test("two distinct IORedis instances pointing at the same URL get distinct registries", () => {
    // IORedis is lazy — it doesn't connect until the first command, so
    // these constructors don't open sockets and don't need a real Redis.
    const conn1 = new IORedis("redis://localhost:6379", {
      lazyConnect: true,
      maxRetriesPerRequest: null,
    });
    const conn2 = new IORedis("redis://localhost:6379", {
      lazyConnect: true,
      maxRetriesPerRequest: null,
    });
    try {
      const r1 = createRegistry({ connection: conn1, queues: ["q"] });
      const r2 = createRegistry({ connection: conn2, queues: ["q"] });
      // Identity-based: two physical connections must not silently alias.
      expect(r1).not.toBe(r2);
      expect(r1.cacheKey).not.toBe(r2.cacheKey);
    } finally {
      conn1.disconnect();
      conn2.disconnect();
    }
  });

  test("the SAME IORedis instance reused across createRegistry calls hits the cache", () => {
    const conn = new IORedis("redis://localhost:6379", {
      lazyConnect: true,
      maxRetriesPerRequest: null,
    });
    try {
      const r1 = createRegistry({ connection: conn, queues: ["q"] });
      const r2 = createRegistry({ connection: conn, queues: ["q"] });
      expect(r1).toBe(r2);
    } finally {
      conn.disconnect();
    }
  });
});

describe("closeAllRegistries", () => {
  test("evicts every cached registry", async () => {
    createRegistry({
      connection: { host: "localhost", port: 6379, db: 0 },
      queues: ["x"],
    });
    createRegistry({
      connection: { host: "localhost", port: 6379, db: 1 },
      queues: ["y"],
    });
    await closeAllRegistries();
    // After clearing, the same options should produce a *new* instance.
    const fresh = createRegistry({
      connection: { host: "localhost", port: 6379, db: 0 },
      queues: ["x"],
    });
    expect(fresh.listQueueNames()).toEqual(["x"]);
  });
});
