/**
 * Pure unit tests for `registerOrpcTools`. Builds a tiny oRPC router
 * (no Redis, no BullMQ, no context), feeds it into the walker against a
 * mock McpServer that records `registerTool` calls, and asserts tool
 * names, descriptions, schemas, and dispatch wiring.
 */
import { describe, expect, test } from "bun:test";

import { os } from "@orpc/server";
import { z } from "zod";

import { registerOrpcTools } from "../src/walker.ts";

// ─── Mock McpServer that just records registerTool calls ────────────────

interface RecordedTool {
  name: string;
  config: {
    description?: string;
    inputSchema?: unknown;
  };
  handler: (args: unknown) => Promise<unknown>;
}

const makeFakeMcpServer = () => {
  const tools: RecordedTool[] = [];
  const server = {
    registerTool: (
      name: string,
      config: RecordedTool["config"],
      handler: RecordedTool["handler"]
    ) => {
      tools.push({ name, config, handler });
      return {} as never;
    },
  };
  // oxlint-disable-next-line no-unsafe-type-assertion -- minimal structural stand-in; the walker only touches registerTool
  return {
    server: server as unknown as Parameters<
      typeof registerOrpcTools
    >[0]["server"],
    tools,
  };
};

// ─── Tiny router with 2 namespaces + 3 procedures ──────────────────────

const base = os.$context<{ userId: string }>();

const fakeRouter = {
  queues: {
    list: base
      .route({ description: "List every queue registered on the server." })
      .handler(() => ({ queues: ["emails", "reports"] })),
    get: base
      .route({ description: "Read a queue snapshot by name." })
      .input(z.object({ name: z.string() }))
      .handler(({ input }) => ({ queue: { name: input.name, counts: {} } })),
  },
  jobs: {
    retry: base
      .route({ description: "Retry a failed job." })
      .input(z.object({ queue: z.string(), jobId: z.string() }))
      .handler(({ input }) => ({ ok: true, jobId: input.jobId })),
  },
  admin: {
    // Not in `includePrefixes` — must be skipped.
    wipe: base.handler(() => ({ ok: true })),
  },
};

describe("registerOrpcTools", () => {
  test("registers one tool per procedure under included prefixes", () => {
    const { server, tools } = makeFakeMcpServer();
    const registered = registerOrpcTools({
      server,
      router: fakeRouter,
      dispatch: async () => ({}),
      includePrefixes: ["queues", "jobs"],
    });

    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(["jobs_retry", "queues_get", "queues_list"]);
    expect(registered.sort()).toEqual([
      "jobs_retry",
      "queues_get",
      "queues_list",
    ]);
  });

  test("skips prefixes not in includePrefixes", () => {
    const { server, tools } = makeFakeMcpServer();
    registerOrpcTools({
      server,
      router: fakeRouter,
      dispatch: async () => ({}),
      includePrefixes: ["queues", "jobs"],
    });
    expect(tools.find((t) => t.name.startsWith("admin_"))).toBeUndefined();
  });

  test("skips dot-paths listed in exclude", () => {
    const { server, tools } = makeFakeMcpServer();
    registerOrpcTools({
      server,
      router: fakeRouter,
      dispatch: async () => ({}),
      includePrefixes: ["queues", "jobs"],
      exclude: ["jobs.retry"],
    });
    expect(tools.find((t) => t.name === "jobs_retry")).toBeUndefined();
    expect(tools.find((t) => t.name === "queues_list")).toBeDefined();
  });

  test("uses route.description as the tool description", () => {
    const { server, tools } = makeFakeMcpServer();
    registerOrpcTools({
      server,
      router: fakeRouter,
      dispatch: async () => ({}),
      includePrefixes: ["queues"],
    });
    const list = tools.find((t) => t.name === "queues_list");
    expect(list?.config.description).toBe(
      "List every queue registered on the server."
    );
  });

  test("descriptions override wins over route.description", () => {
    const { server, tools } = makeFakeMcpServer();
    registerOrpcTools({
      server,
      router: fakeRouter,
      dispatch: async () => ({}),
      includePrefixes: ["queues"],
      descriptions: { queues_list: "Custom description." },
    });
    const list = tools.find((t) => t.name === "queues_list");
    expect(list?.config.description).toBe("Custom description.");
  });

  test("input schema is propagated when present", () => {
    const { server, tools } = makeFakeMcpServer();
    registerOrpcTools({
      server,
      router: fakeRouter,
      dispatch: async () => ({}),
      includePrefixes: ["queues"],
    });
    const get = tools.find((t) => t.name === "queues_get");
    expect(get?.config.inputSchema).toBeDefined();
    const listNoSchema = tools.find((t) => t.name === "queues_list");
    expect(listNoSchema?.config.inputSchema).toBeUndefined();
  });

  test("tool handler forwards input to dispatch and wraps the result", async () => {
    const { server, tools } = makeFakeMcpServer();
    const calls: Array<{ path: readonly string[]; input: unknown }> = [];
    registerOrpcTools({
      server,
      router: fakeRouter,
      dispatch: async (path, input) => {
        calls.push({ path, input });
        return { queues: ["a", "b"] };
      },
      includePrefixes: ["queues"],
    });
    const list = tools.find((t) => t.name === "queues_list");
    const result = (await list?.handler({})) as {
      content: Array<{ type: string; text: string }>;
    };
    expect(calls).toHaveLength(1);
    expect(calls[0]?.path).toEqual(["queues", "list"]);
    expect(result.content[0]?.type).toBe("text");
    expect(JSON.parse(result.content[0]!.text)).toEqual({
      queues: ["a", "b"],
    });
  });

  test("dispatch errors are wrapped as isError tool results", async () => {
    const { server, tools } = makeFakeMcpServer();
    registerOrpcTools({
      server,
      router: fakeRouter,
      dispatch: async () => {
        throw new Error("boom");
      },
      includePrefixes: ["queues"],
    });
    const list = tools.find((t) => t.name === "queues_list");
    const result = (await list?.handler({})) as {
      content: Array<{ text: string }>;
      isError?: boolean;
    };
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("boom");
  });

  test("custom nameFor overrides the default underscore join", () => {
    const { server, tools } = makeFakeMcpServer();
    registerOrpcTools({
      server,
      router: fakeRouter,
      dispatch: async () => ({}),
      includePrefixes: ["queues"],
      nameFor: (path) => path.join("."),
    });
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(["queues.get", "queues.list"]);
  });
});
