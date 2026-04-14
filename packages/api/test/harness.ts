/**
 * Test harness for direct `call(procedure, input, { context })` tests.
 *
 * We don't spin up HTTP, we don't mock fetch, and we don't need a live
 * Redis. Instead we construct a minimal `ViewerContext` with a fake
 * `QueueRegistry` that returns fake `Queue` objects whose methods are
 * stubbed per test. The full oRPC middleware chain (scope checks,
 * readOnly, queueProcedure resolve, typed errors) still runs against
 * the fake, so tests exercise the real behavior for free.
 *
 * Usage:
 *
 *   import { call } from "@orpc/server"
 *   import { createTestContext, fakeQueue } from "../test/harness.ts"
 *   import { queuesRouter } from "../src/routers/queues.ts"
 *
 *   const ctx = createTestContext({
 *     scopes: ["read"],
 *     queues: { emails: fakeQueue({ counts: { waiting: 3 } }) },
 *   })
 *   const result = await call(queuesRouter.list, {}, { context: ctx })
 *   expect(result.queues[0].counts.waiting).toBe(3)
 */
import type { JobCounts, Scope, Viewer } from "@grmkris/bull-viewer-core";
import type { QueueRegistry } from "@grmkris/bull-viewer-core/server";
import type { Queue } from "bullmq";

import type { ViewerContext } from "../src/lib/context.ts";
import { silentLogger } from "../src/lib/logger.ts";

// ─── Fake Queue ──────────────────────────────────────────────────────────

export interface FakeQueueOptions {
  name?: string;
  counts?: Partial<JobCounts>;
  isPaused?: boolean;
  jobs?: FakeJob[];
  /** Override any method manually. Used to inject errors per test. */
  overrides?: Partial<Queue>;
}

export interface FakeJob {
  id: string;
  name: string;
  data?: unknown;
  opts?: { attempts?: number };
  state?: "waiting" | "active" | "completed" | "failed" | "delayed" | "paused";
  attemptsMade?: number;
  timestamp?: number;
  processedOn?: number | null;
  finishedOn?: number | null;
  failedReason?: string | null;
  returnvalue?: unknown;
  stacktrace?: string[];
  progress?: number;
  parentKey?: string;
}

function defaultCounts(partial: Partial<JobCounts> = {}): JobCounts {
  return {
    waiting: 0,
    active: 0,
    completed: 0,
    failed: 0,
    delayed: 0,
    paused: 0,
    prioritized: 0,
    "waiting-children": 0,
    ...partial,
  };
}

/**
 * Build a Queue-compatible stub. Not all methods are implemented — add
 * what your test needs via `overrides`. The ones that ARE stubbed are
 * the hot-path methods the routers actually call: getJobCounts,
 * getJobCountByTypes, getJobs, getJob, isPaused, pause, resume, name.
 */
export function fakeQueue(options: FakeQueueOptions = {}): Queue {
  const name = options.name ?? "test-queue";
  const counts = defaultCounts(options.counts);
  const jobs = options.jobs ?? [];
  let paused = options.isPaused ?? false;

  const makeJob = (j: FakeJob): unknown => ({
    id: j.id,
    name: j.name,
    data: j.data ?? {},
    opts: j.opts ?? {},
    progress: j.progress ?? 0,
    returnvalue: j.returnvalue ?? null,
    failedReason: j.failedReason ?? null,
    stacktrace: j.stacktrace ?? [],
    attemptsMade: j.attemptsMade ?? 0,
    timestamp: j.timestamp ?? Date.now(),
    processedOn: j.processedOn ?? null,
    finishedOn: j.finishedOn ?? null,
    parentKey: j.parentKey,
    getState: async () => j.state ?? "waiting",
    getDependencies: async () => ({ processed: {}, unprocessed: [] }),
    retry: async () => {},
    remove: async () => {},
    promote: async () => {},
  });

  const byState = (state: string) =>
    jobs.filter((j) => (j.state ?? "waiting") === state);

  // Cast `counts` once to a string-indexable view so the fake getters can
  // do dynamic key lookups without each call re-asserting the conversion.
  // `JobCounts` is a closed shape so TS won't index into it directly.
  const countsByName = counts as unknown as Record<string, number>;

  const stub: Partial<Queue> = {
    name,
    getJobCounts: (async (..._types: string[]) => countsByName) as unknown as Queue["getJobCounts"],
    getJobCountByTypes: (async (..._types: string[]) => {
      let total = 0;
      for (const t of _types) {
        total += countsByName[t] ?? 0;
      }
      return total;
    }) as unknown as Queue["getJobCountByTypes"],
    getJobs: (async (
      types: string[] | string = [],
      start = 0,
      end = -1,
      _asc = true,
    ) => {
      const typeList = Array.isArray(types) ? types : [types];
      const matched: unknown[] = [];
      for (const t of typeList) {
        for (const j of byState(t)) {
          matched.push(makeJob(j));
        }
      }
      const slice =
        end === -1 ? matched.slice(start) : matched.slice(start, end + 1);
      return slice;
    }) as unknown as Queue["getJobs"],
    getJob: (async (id: string) => {
      const j = jobs.find((x) => x.id === id);
      return j ? (makeJob(j) as unknown) : null;
    }) as Queue["getJob"],
    isPaused: async () => paused,
    pause: async () => {
      paused = true;
    },
    resume: async () => {
      paused = false;
    },
    ...(options.overrides as Partial<Queue>),
  };

  return stub as Queue;
}

// ─── Fake Registry ───────────────────────────────────────────────────────

export interface CreateTestContextOptions {
  scopes?: Scope[];
  viewer?: Viewer | null;
  readOnly?: boolean;
  queues?: Record<string, Queue>;
  /** Override specific context fields directly. */
  overrides?: Partial<ViewerContext>;
}

export function createFakeRegistry(
  queues: Record<string, Queue>
): QueueRegistry {
  const map = new Map(Object.entries(queues));
  return {
    connection: {} as QueueRegistry["connection"],
    cacheKey: "test",
    listQueueNames: () => [...map.keys()],
    getQueue: (name) => map.get(name),
    getAll: () => new Map(map),
    close: async () => {},
  };
}

/**
 * Build a `ViewerContext` for direct `call(procedure, input, { context })`.
 * Defaults: no viewer, `["read"]` scope only, not read-only, silent logger,
 * synthesized `tenantId: "test"`, no registered queues.
 */
export function createTestContext(
  options: CreateTestContextOptions = {}
): ViewerContext {
  const queues = options.queues ?? {};
  const registry = createFakeRegistry(queues);
  return {
    registry,
    viewer: options.viewer ?? null,
    scopes: new Set(options.scopes ?? ["read"]),
    readOnly: options.readOnly ?? false,
    headers: new Headers(),
    requestId: "test",
    tenantId: "test",
    logger: silentLogger,
    ...options.overrides,
  };
}
