import { createRegistry, type QueueRegistry } from "@grmkris/bull-viewer-core/server";
import { type Job, type JobsOptions, Queue, Worker } from "bullmq";
import IORedis from "ioredis";

/**
 * Build a real `QueueRegistry` against the given Redis URL. Uses one ioredis
 * connection internally (BullMQ-recommended `maxRetriesPerRequest: null`).
 *
 * Returns the same shape `createQueuesApiHandler` consumes in production, so
 * tests can pass it through `buildContext` and exercise the full oRPC
 * middleware chain end-to-end without any fakes.
 */
export function createTestRegistry(
  redisUrl: string,
  queueNames: string[],
): { registry: QueueRegistry; connection: IORedis } {
  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const registry = createRegistry({ connection, queues: queueNames });
  return { registry, connection };
}

/**
 * Drop a job into a queue with sensible defaults. Returns the live `Job` so
 * tests can `.waitUntilFinished()` or assert on `id` / `state`.
 */
export async function enqueueJob<TData = unknown>(
  queue: Queue,
  name: string,
  data: TData,
  opts?: JobsOptions,
): Promise<Job<TData>> {
  return await queue.add(name, data as TData, opts);
}

/**
 * Spin up a temporary worker that processes one job and throws. Used to
 * deterministically populate the `failed` state for tests that want to
 * exercise retry / remove / move-to-failed against a real failed job.
 *
 * The caller is responsible for closing the returned worker; do it in an
 * `afterAll` block alongside the registry close.
 */
export function createFailingWorker<TData = unknown>(
  redisUrl: string,
  queueName: string,
  reason = "intentional test failure",
): Worker<TData> {
  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  return new Worker<TData>(
    queueName,
    () => {
      throw new Error(reason);
    },
    { connection, autorun: true },
  );
}

/**
 * Spin up a temporary worker that completes every job successfully with the
 * given return value. Useful for tests that want to populate the `completed`
 * state.
 */
export function createPassingWorker<TData = unknown, TResult = unknown>(
  redisUrl: string,
  queueName: string,
  result: TResult,
): Worker<TData, TResult> {
  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  return new Worker<TData, TResult>(
    queueName,
    async () => result,
    { connection, autorun: true },
  );
}

/**
 * Wait until `condition()` returns truthy, polling every `interval` ms up to
 * `timeout`. Throws with a clear message on timeout. Lifted from
 * `ai-stilist/packages/api/src/test/helpers.ts:43-67`.
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  options: { timeout?: number; interval?: number; message?: string } = {},
): Promise<void> {
  const timeout = options.timeout ?? 5000;
  const interval = options.interval ?? 50;
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await condition()) return;
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error(
    options.message ?? `timed out after ${timeout}ms waiting for condition`,
  );
}

/**
 * Drain every queue in a registry by calling `obliterate({ force: true })`,
 * then close the registry. Pair with `setup.shutdown()` in `afterAll`.
 */
export async function drainAndCloseRegistry(
  registry: QueueRegistry,
): Promise<void> {
  for (const queue of registry.getAll().values()) {
    try {
      await queue.obliterate({ force: true });
    } catch {
      /* queue already closed / never had data */
    }
  }
  await registry.close();
}
