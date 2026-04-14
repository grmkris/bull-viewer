import { afterAll, beforeAll, describe, expect, test } from "bun:test";

/**
 * Integration test for the MCP Streamable HTTP transport mounted inside
 * `createQueuesApiHandler`. Boots a real `redis-memory-server`, wires the
 * MCP handler into the API dispatcher, then sends real JSON-RPC messages
 * (`initialize`, `tools/list`, `tools/call`) as `Request` objects to the
 * `/api/tenants/:id/mcp` endpoint and asserts the responses.
 *
 * Verifies the full chain: URL match → tenant resolution → buildContext
 * (auth + scope) → MCP branch → walker → in-process dispatch → real
 * BullMQ procedure → result wrapping.
 */
import { createBullViewerMcpHandler } from "@grmkris/bull-viewer-mcp";
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

let redis: RedisTestSetup;
let cleanup: (() => Promise<void>) | null = null;
let handler: Handler;

const QUEUE = `mcp-int-${crypto.randomUUID().slice(0, 8)}`;
const BASE_PATH = "/api";

const MCP_HEADERS = {
  "content-type": "application/json",
  accept: "application/json, text/event-stream",
};

beforeAll(async () => {
  redis = await createTestRedisSetup();
  const built = createTestRegistry(redis.url, [QUEUE]);
  cleanup = built.cleanup;

  const queue = built.registry.getQueue(QUEUE);
  if (!queue) throw new Error("seed queue missing");
  await queue.add("welcome", { user: 1 });
  await queue.add("welcome", { user: 2 });

  const tenants: Record<string, TenantConfig> = {
    "tenant-a": { label: "Tenant A", registry: built.registry },
  };

  handler = createQueuesApiHandler({
    tenants,
    defaultTenant: "tenant-a",
    basePath: BASE_PATH,
    mcpHandler: createBullViewerMcpHandler(),
  });
});

afterAll(async () => {
  if (cleanup) await cleanup();
  if (redis) await redis.shutdown();
});

const url = (path: string) => `http://test.local${BASE_PATH}${path}`;

const postJsonRpc = async (path: string, body: unknown) => {
  const res = await handler(
    new Request(url(path), {
      method: "POST",
      headers: MCP_HEADERS,
      body: JSON.stringify(body),
    })
  );
  return res;
};

/**
 * The Streamable HTTP transport in stateless mode replies either with
 * `application/json` (single response) or `text/event-stream` (one or
 * more `data: { ... }` SSE frames). This helper extracts the JSON-RPC
 * payload from either shape.
 */
const readJsonRpcResponse = async (
  res: Response
): Promise<{ result?: unknown; error?: unknown; id?: unknown }> => {
  const contentType = res.headers.get("content-type") ?? "";
  const text = await res.text();
  if (contentType.includes("application/json")) {
    return JSON.parse(text) as { result?: unknown; error?: unknown };
  }
  // SSE frames: lines start with "data: { ... }"
  const dataLine = text.split("\n").find((l) => l.startsWith("data: "));
  if (!dataLine) {
    throw new Error(`No JSON-RPC payload in response: ${text}`);
  }
  return JSON.parse(dataLine.slice(6)) as { result?: unknown; error?: unknown };
};

describe("MCP Streamable HTTP — tenant-scoped endpoint", () => {
  test("tools/list returns every expected tool", async () => {
    const res = await postJsonRpc("/tenants/tenant-a/mcp", {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {},
    });
    expect(res.status).toBe(200);
    const payload = await readJsonRpcResponse(res);
    const result = payload.result as { tools: Array<{ name: string }> };
    const names = new Set(result.tools.map((t) => t.name));

    // Every top-level namespace should be present at least once.
    expect(names.has("queues_list")).toBe(true);
    expect(names.has("queues_get")).toBe(true);
    expect(names.has("jobs_list")).toBe(true);
    expect(names.has("jobs_get")).toBe(true);
    expect(names.has("metrics_get")).toBe(true);
    expect(names.has("search_jobs")).toBe(true);
    expect(names.has("me")).toBe(true);
  });

  test("tools/call queues_list returns real BullMQ data", async () => {
    const res = await postJsonRpc("/tenants/tenant-a/mcp", {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "queues_list", arguments: {} },
    });
    expect(res.status).toBe(200);
    const payload = await readJsonRpcResponse(res);
    const result = payload.result as {
      content: Array<{ type: string; text: string }>;
      isError?: boolean;
    };
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0]!.text) as {
      queues: Array<{ name: string; counts: Record<string, number> }>;
    };
    const found = parsed.queues.find((q) => q.name === QUEUE);
    expect(found).toBeDefined();
    expect(found?.counts.waiting).toBeGreaterThanOrEqual(2);
  });
});

describe("MCP Streamable HTTP — legacy /mcp alias", () => {
  test("/api/mcp resolves to the default tenant", async () => {
    const res = await postJsonRpc("/mcp", {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/list",
      params: {},
    });
    expect(res.status).toBe(200);
    const payload = await readJsonRpcResponse(res);
    const result = payload.result as { tools: Array<{ name: string }> };
    expect(result.tools.length).toBeGreaterThan(0);
  });
});

describe("MCP not mounted when handler missing", () => {
  test("returns 404 if mcpHandler option is omitted", async () => {
    const built = createTestRegistry(redis.url, [QUEUE]);
    const noMcp = createQueuesApiHandler({
      tenants: { only: { registry: built.registry } },
      defaultTenant: "only",
      basePath: BASE_PATH,
    });
    const res = await noMcp(
      new Request(url("/tenants/only/mcp"), {
        method: "POST",
        headers: MCP_HEADERS,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 99,
          method: "tools/list",
        }),
      })
    );
    expect(res.status).toBe(404);
    await built.cleanup();
  });
});
