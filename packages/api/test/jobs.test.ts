import { describe, expect, test } from "bun:test";

import { call } from "@orpc/server";

import { jobsRouter } from "../src/routers/jobs.ts";
import { createTestContext, fakeQueue } from "./harness.ts";

describe("jobs.action", () => {
  test("retry requires the retry scope", async () => {
    const ctx = createTestContext({
      scopes: ["read"],
      queues: {
        emails: fakeQueue({
          name: "emails",
          jobs: [{ id: "1", name: "send", state: "failed" }],
        }),
      },
    });
    await expect(
      call(
        jobsRouter.action,
        { name: "emails", id: "1", action: "retry" },
        { context: ctx }
      )
    ).rejects.toThrow(/retry|forbidden/i);
  });

  test("retry succeeds when the scope is present", async () => {
    const ctx = createTestContext({
      scopes: ["read", "retry"],
      queues: {
        emails: fakeQueue({
          name: "emails",
          jobs: [{ id: "1", name: "send", state: "failed" }],
        }),
      },
    });
    const result = await call(
      jobsRouter.action,
      { name: "emails", id: "1", action: "retry" },
      { context: ctx }
    );
    expect(result).toEqual({ ok: true });
  });

  test("remove in readOnly mode throws ReadOnly", async () => {
    const ctx = createTestContext({
      scopes: ["read", "remove"],
      readOnly: true,
      queues: {
        emails: fakeQueue({
          name: "emails",
          jobs: [{ id: "1", name: "send" }],
        }),
      },
    });
    await expect(
      call(
        jobsRouter.action,
        { name: "emails", id: "1", action: "remove" },
        { context: ctx }
      )
    ).rejects.toThrow(/read-?only/i);
  });

  test("action on unknown queue → QueueMissing", async () => {
    const ctx = createTestContext({
      scopes: ["read", "retry"],
      queues: {},
    });
    await expect(
      call(
        jobsRouter.action,
        { name: "ghost", id: "1", action: "retry" },
        { context: ctx }
      )
    ).rejects.toThrow(/queue not found|ghost/i);
  });
});

describe("jobs.get", () => {
  test("404 when the job id is unknown", async () => {
    const ctx = createTestContext({
      scopes: ["read"],
      queues: {
        emails: fakeQueue({ name: "emails", jobs: [{ id: "1", name: "a" }] }),
      },
    });
    await expect(
      call(jobsRouter.get, { name: "emails", id: "42" }, { context: ctx })
    ).rejects.toThrow(/not found|42/i);
  });

  test("returns the job snapshot when present", async () => {
    const ctx = createTestContext({
      scopes: ["read"],
      queues: {
        emails: fakeQueue({
          name: "emails",
          jobs: [
            {
              id: "1",
              name: "send-welcome",
              data: { to: "a@b.com" },
              state: "completed",
            },
          ],
        }),
      },
    });
    const result = await call(
      jobsRouter.get,
      { name: "emails", id: "1" },
      { context: ctx }
    );
    expect(result.job.id).toBe("1");
    expect(result.job.name).toBe("send-welcome");
    expect(result.job.state).toBe("completed");
  });
});
