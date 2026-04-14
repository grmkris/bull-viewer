/**
 * Pure unit tests for the env-var → tenant config parser. No Redis, no
 * BullMQ, no IORedis. Validates the boundary between
 * `BULL_VIEWER_TENANTS_JSON` and the rest of the standalone server.
 */
import { describe, expect, test } from "bun:test";

import {
  parseTenantsJson,
  resolveDefaultTenantId,
  TenantsConfigError,
} from "./tenants.ts";

describe("parseTenantsJson", () => {
  test("parses a well-formed multi-tenant array", () => {
    const raw = JSON.stringify([
      {
        id: "ai-stilist",
        label: "AI Stilist",
        redis: "redis://localhost:6383",
        queues: ["analyze-image", "forensic-scan"],
      },
      {
        id: "zednabi",
        redis: "redis://localhost:6382",
        queues: ["rsge-initial-sync"],
      },
    ]);
    const result = parseTenantsJson(raw);
    expect(result).toHaveLength(2);
    expect(result[0]?.id).toBe("ai-stilist");
    expect(result[0]?.label).toBe("AI Stilist");
    expect(result[0]?.queues).toEqual(["analyze-image", "forensic-scan"]);
    expect(result[1]?.label).toBeUndefined();
  });

  test("throws on invalid JSON", () => {
    expect(() => parseTenantsJson("{ not json")).toThrow(TenantsConfigError);
    expect(() => parseTenantsJson("{ not json")).toThrow(/not valid JSON/);
  });

  test("throws when not an array", () => {
    expect(() => parseTenantsJson(JSON.stringify({ id: "x" }))).toThrow(
      /must be a JSON array/
    );
  });

  test("throws on empty array", () => {
    expect(() => parseTenantsJson("[]")).toThrow(/at least one tenant/);
  });

  test("throws when a tenant has no id", () => {
    const raw = JSON.stringify([
      { redis: "redis://localhost:6379", queues: ["q"] },
    ]);
    expect(() => parseTenantsJson(raw)).toThrow(/non-empty `id`/);
  });

  test("throws when a tenant has an empty id", () => {
    const raw = JSON.stringify([
      { id: "", redis: "redis://localhost:6379", queues: ["q"] },
    ]);
    expect(() => parseTenantsJson(raw)).toThrow(/non-empty `id`/);
  });

  test("throws on duplicate tenant ids", () => {
    const raw = JSON.stringify([
      { id: "x", redis: "redis://localhost:6379", queues: ["q"] },
      { id: "x", redis: "redis://localhost:6380", queues: ["r"] },
    ]);
    expect(() => parseTenantsJson(raw)).toThrow(/duplicate tenant id "x"/);
  });

  test("throws when a tenant has no redis URL", () => {
    const raw = JSON.stringify([{ id: "a", queues: ["q"] }]);
    expect(() => parseTenantsJson(raw)).toThrow(/requires a `redis` URL/);
  });

  test("throws when queues is missing", () => {
    const raw = JSON.stringify([{ id: "a", redis: "redis://localhost:6379" }]);
    expect(() => parseTenantsJson(raw)).toThrow(
      /requires a non-empty `queues` array/
    );
  });

  test("throws when queues is empty", () => {
    const raw = JSON.stringify([
      { id: "a", redis: "redis://localhost:6379", queues: [] },
    ]);
    expect(() => parseTenantsJson(raw)).toThrow(
      /requires a non-empty `queues` array/
    );
  });

  test("throws when a queue entry is not a string", () => {
    const raw = JSON.stringify([
      { id: "a", redis: "redis://localhost:6379", queues: ["good", 42] },
    ]);
    expect(() => parseTenantsJson(raw)).toThrow(/invalid queue name/);
  });

  test("throws when label is the wrong type", () => {
    const raw = JSON.stringify([
      {
        id: "a",
        label: 42,
        redis: "redis://localhost:6379",
        queues: ["q"],
      },
    ]);
    expect(() => parseTenantsJson(raw)).toThrow(/`label` must be a string/);
  });
});

describe("resolveDefaultTenantId", () => {
  const tenants = [
    { id: "first", redis: "redis://a", queues: ["q"] },
    { id: "second", redis: "redis://b", queues: ["q"] },
    { id: "third", redis: "redis://c", queues: ["q"] },
  ];

  test("uses the explicit env value when valid", () => {
    expect(resolveDefaultTenantId(tenants, "second")).toBe("second");
  });

  test("falls back to the first tenant when env is unset", () => {
    expect(resolveDefaultTenantId(tenants, undefined)).toBe("first");
  });

  test("falls back to the first tenant when env is empty string", () => {
    expect(resolveDefaultTenantId(tenants, "")).toBe("first");
  });

  test("falls back to the first tenant when env is whitespace", () => {
    expect(resolveDefaultTenantId(tenants, "   ")).toBe("first");
  });

  test("throws when explicit value is not in the list", () => {
    expect(() => resolveDefaultTenantId(tenants, "missing")).toThrow(
      TenantsConfigError
    );
    expect(() => resolveDefaultTenantId(tenants, "missing")).toThrow(
      /not found in tenants list/
    );
  });

  test("throws when the tenants list is empty", () => {
    expect(() => resolveDefaultTenantId([], "anything")).toThrow(
      /cannot resolve default/
    );
  });
});
