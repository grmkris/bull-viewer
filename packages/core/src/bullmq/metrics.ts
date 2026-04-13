import type { Queue } from "bullmq";
import type { ConnectionOptions } from "bullmq";
import { Redis } from "ioredis";

import { subscribeQueueEvents } from "./events.ts";

const TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
const SAMPLE_CAP = 1024;
const SNAPSHOT_INTERVAL_MS = 60_000;

function minuteEpoch(ts = Date.now()): number {
  return Math.floor(ts / 60_000);
}

function keyCounts(queue: string, minute: number) {
  return `bv:m:${queue}:${minute}:counts`;
}
function keyDurC(queue: string, minute: number) {
  return `bv:m:${queue}:${minute}:dur:c`;
}
function keyDurF(queue: string, minute: number) {
  return `bv:m:${queue}:${minute}:dur:f`;
}
function keySnap(queue: string, minute: number) {
  return `bv:m:${queue}:${minute}:snap`;
}

function getRedisClient(connection: ConnectionOptions): Redis {
  if (connection instanceof Redis) return connection;
  if (typeof connection === "string") return new Redis(connection);
  return new Redis(connection as Record<string, unknown>);
}

export interface MetricsCollector {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface CreateCollectorOptions {
  connection: ConnectionOptions;
  queues: () => Map<string, Queue>;
}

export function createMetricsCollector(
  opts: CreateCollectorOptions
): MetricsCollector {
  const redis = getRedisClient(opts.connection);
  const cleanupFns: Array<() => void> = [];
  const intervals: Array<ReturnType<typeof setInterval>> = [];

  return {
    async start() {
      for (const [name, queue] of opts.queues()) {
        // 1) percentile + throughput sampling via QueueEvents
        const unsub = subscribeQueueEvents(
          name,
          opts.connection,
          async (ev) => {
            if (ev.type !== "completed" && ev.type !== "failed") return;
            try {
              const job = await queue.getJob(ev.jobId);
              if (!job || job.processedOn == null || job.finishedOn == null)
                return;
              const duration = job.finishedOn - job.processedOn;
              const minute = minuteEpoch(job.finishedOn);
              const counts = keyCounts(name, minute);
              const durKey =
                ev.type === "completed"
                  ? keyDurC(name, minute)
                  : keyDurF(name, minute);
              const field = ev.type === "completed" ? "completed" : "failed";

              const pipeline = redis.pipeline();
              pipeline.hincrby(counts, field, 1);
              pipeline.expire(counts, TTL_SECONDS);
              pipeline.zadd(durKey, duration, `${ev.jobId}-${Date.now()}`);
              pipeline.zremrangebyrank(durKey, 0, -SAMPLE_CAP - 1);
              pipeline.expire(durKey, TTL_SECONDS);
              await pipeline.exec();
            } catch {
              /* swallow */
            }
          }
        );
        cleanupFns.push(unsub);

        // 2) Periodic backlog snapshot
        const snap = async () => {
          try {
            const minute = minuteEpoch();
            const [counts, waitingJobs, activeJobs] = await Promise.all([
              queue.getJobCounts("waiting", "delayed", "active"),
              queue.getJobs(["waiting"], 0, 0, true),
              queue.getJobs(["active"], 0, 0, true),
            ]);
            const oldestWaiting = waitingJobs[0]?.timestamp ?? null;
            const oldestActive = activeJobs[0]?.timestamp ?? null;
            const key = keySnap(name, minute);
            const pipeline = redis.pipeline();
            pipeline.hset(
              key,
              "waiting",
              counts.waiting ?? 0,
              "delayed",
              counts.delayed ?? 0,
              "active",
              counts.active ?? 0,
              "oldestWaiting",
              oldestWaiting ?? 0,
              "oldestActive",
              oldestActive ?? 0
            );
            pipeline.expire(key, TTL_SECONDS);
            await pipeline.exec();
          } catch {
            /* swallow */
          }
        };
        // run once immediately so charts have data on first paint
        void snap();
        intervals.push(setInterval(snap, SNAPSHOT_INTERVAL_MS));
      }
    },
    async stop() {
      for (const fn of cleanupFns) fn();
      cleanupFns.length = 0;
      for (const t of intervals) clearInterval(t);
      intervals.length = 0;
    },
  };
}

// ───────────────── reads ─────────────────

export interface MetricBucket {
  ts: number; // ms epoch (start of minute)
  completed: number;
  failed: number;
  waiting: number | null;
  delayed: number | null;
  active: number | null;
  oldestWaiting: number | null;
  oldestActive: number | null;
  p50: number | null;
  p95: number | null;
  p99: number | null;
}

export interface ReadMetricsOptions {
  range: "15m" | "1h" | "6h" | "24h" | "7d";
}

const RANGE_MINUTES: Record<ReadMetricsOptions["range"], number> = {
  "15m": 15,
  "1h": 60,
  "6h": 360,
  "24h": 1440,
  "7d": 10080,
};

export async function readMetrics(
  connection: ConnectionOptions,
  queueName: string,
  options: ReadMetricsOptions
): Promise<{ buckets: MetricBucket[] }> {
  const redis = getRedisClient(connection);
  const totalMinutes = RANGE_MINUTES[options.range];
  const nowMinute = minuteEpoch();
  const minutes: number[] = [];
  for (let i = totalMinutes - 1; i >= 0; i--) {
    minutes.push(nowMinute - i);
  }

  const pipeline = redis.pipeline();
  for (const m of minutes) {
    pipeline.hgetall(keyCounts(queueName, m));
    pipeline.zrange(keyDurC(queueName, m), 0, -1, "WITHSCORES");
    pipeline.zrange(keyDurF(queueName, m), 0, -1, "WITHSCORES");
    pipeline.hgetall(keySnap(queueName, m));
  }
  const raw = (await pipeline.exec()) ?? [];

  const buckets: MetricBucket[] = [];
  for (let i = 0; i < minutes.length; i++) {
    const off = i * 4;
    const counts = (raw[off]?.[1] as Record<string, string> | null) ?? {};
    const durC = (raw[off + 1]?.[1] as string[] | null) ?? [];
    const durF = (raw[off + 2]?.[1] as string[] | null) ?? [];
    const snap = (raw[off + 3]?.[1] as Record<string, string> | null) ?? {};

    const allDurations = mergeDurationScores(durC, durF);
    const percentiles = computePercentiles(allDurations);

    buckets.push({
      ts: minutes[i]! * 60_000,
      completed: Number(counts.completed ?? 0),
      failed: Number(counts.failed ?? 0),
      waiting: snap.waiting != null ? Number(snap.waiting) : null,
      delayed: snap.delayed != null ? Number(snap.delayed) : null,
      active: snap.active != null ? Number(snap.active) : null,
      oldestWaiting:
        snap.oldestWaiting && Number(snap.oldestWaiting) > 0
          ? Number(snap.oldestWaiting)
          : null,
      oldestActive:
        snap.oldestActive && Number(snap.oldestActive) > 0
          ? Number(snap.oldestActive)
          : null,
      p50: percentiles.p50,
      p95: percentiles.p95,
      p99: percentiles.p99,
    });
  }

  return { buckets };
}

function mergeDurationScores(...lists: string[][]): number[] {
  const out: number[] = [];
  for (const list of lists) {
    for (let i = 1; i < list.length; i += 2) {
      const v = Number(list[i]);
      if (!Number.isNaN(v)) out.push(v);
    }
  }
  return out;
}

function computePercentiles(values: number[]): {
  p50: number | null;
  p95: number | null;
  p99: number | null;
} {
  if (values.length === 0) return { p50: null, p95: null, p99: null };
  const sorted = values.slice().sort((a, b) => a - b);
  const pick = (p: number) => {
    const idx = Math.min(
      sorted.length - 1,
      Math.floor((sorted.length - 1) * p)
    );
    return sorted[idx]!;
  };
  return { p50: pick(0.5), p95: pick(0.95), p99: pick(0.99) };
}
