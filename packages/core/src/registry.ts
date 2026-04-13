import { Queue } from "bullmq";
import type { ConnectionOptions } from "bullmq";

export interface RegistryOptions {
  connection: ConnectionOptions;
  queues: string[];
  /** Optional stable key override — otherwise derived from connection + queues. */
  cacheKey?: string;
}

export interface QueueRegistry {
  readonly connection: ConnectionOptions;
  readonly cacheKey: string;
  listQueueNames(): string[];
  getQueue(name: string): Queue | undefined;
  getAll(): Map<string, Queue>;
  close(): Promise<void>;
}

// Cached on globalThis so Next.js HMR / repeated route-handler invocations
// reuse the same Queue/ioredis connections instead of instantiating fresh
// ones on every request.
//
// Key is versioned so two major versions of @bull-viewer/core loaded into
// the same process (e.g. monorepo dedupe failure, compiled + source) don't
// corrupt each other's caches.
const GLOBAL_KEY = "__bullViewerRegistries_v1__";
type GlobalWithCache = typeof globalThis & {
  [GLOBAL_KEY]?: Map<string, QueueRegistry>;
  __bullViewerConnIdents__?: WeakMap<object, string>;
};
const g = globalThis as GlobalWithCache;
const cache: Map<string, QueueRegistry> = g[GLOBAL_KEY] ?? (g[GLOBAL_KEY] = new Map());

// Side-table mapping a live IORedis instance to a stable identity string.
// We can't hash IORedis's runtime state (sockets, pool, etc.) so we use
// object identity instead — two different `new IORedis(url)` calls get
// two different cache entries even if the URL is the same. That's the
// correct behavior: two physical connections should not silently share a
// registry.
const instanceIdents: WeakMap<object, string> =
  g.__bullViewerConnIdents__ ?? (g.__bullViewerConnIdents__ = new WeakMap());
let instanceCounter = 0;

/**
 * Duck-type an IORedis instance. IORedis doesn't export its class cleanly
 * enough to `instanceof`, so we sniff the shape: live instances have
 * `.options`, `.status`, and (in every real version we've seen) one of
 * `.connector` / `.stream` / `.commandQueue`. This avoids a hard import
 * of `ioredis` here.
 */
function isIORedisInstance(c: unknown): boolean {
  if (typeof c !== "object" || c === null) return false;
  const obj = c as Record<string, unknown>;
  return (
    "options" in obj &&
    typeof obj.options === "object" &&
    obj.options !== null &&
    "status" in obj
  );
}

function identOf(instance: object): string {
  const existing = instanceIdents.get(instance);
  if (existing) return existing;
  instanceCounter += 1;
  const id = `ioredis#${instanceCounter}`;
  instanceIdents.set(instance, id);
  return id;
}

function hashString(s: string): string {
  // Cheap non-cryptographic hash so we don't store raw passwords in cache keys.
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

function fromPlainConnectionOptions(c: Record<string, unknown>): string {
  const host = (c.host as string | undefined) ?? "";
  const port = (c.port as number | string | undefined) ?? "";
  const db = (c.db as number | undefined) ?? 0;
  const family = (c.family as number | undefined) ?? "";
  const user = (c.username as string | undefined) ?? "";
  const path = (c.path as string | undefined) ?? "";
  const keyPrefix = (c.keyPrefix as string | undefined) ?? "";
  const tls = c.tls != null ? "tls" : "";
  const passwordHash = c.password ? hashString(String(c.password)) : "";
  return `${host}:${port}/${db}/${family}/${user}/${path}/${keyPrefix}/${tls}/${passwordHash}`;
}

function deriveCacheKey(options: RegistryOptions): string {
  if (options.cacheKey) return options.cacheKey;
  const c = options.connection as unknown;
  let connPart: string;
  if (typeof c === "string") {
    connPart = c;
  } else if (isIORedisInstance(c)) {
    // Live IORedis instance — key by object identity so two separate
    // connections never alias, even if they point at the same URL.
    connPart = identOf(c as object);
  } else if (c && typeof c === "object") {
    connPart = fromPlainConnectionOptions(c as Record<string, unknown>);
  } else {
    connPart = "?";
  }
  const qPart = [...options.queues].sort().join(",");
  return `${connPart}|${qPart}`;
}

export function createRegistry(options: RegistryOptions): QueueRegistry {
  const key = deriveCacheKey(options);
  const cached = cache.get(key);
  if (cached) return cached;

  const queues = new Map<string, Queue>();
  for (const name of options.queues) {
    queues.set(name, new Queue(name, { connection: options.connection }));
  }

  const registry: QueueRegistry = {
    connection: options.connection,
    cacheKey: key,
    listQueueNames() {
      return [...queues.keys()];
    },
    getQueue(name) {
      return queues.get(name);
    },
    getAll() {
      return new Map(queues);
    },
    async close() {
      await Promise.all([...queues.values()].map((q) => q.close()));
      queues.clear();
      cache.delete(key);
    },
  };

  cache.set(key, registry);
  return registry;
}

/** Test/teardown helper: close every cached registry. */
export async function closeAllRegistries(): Promise<void> {
  const all = [...cache.values()];
  cache.clear();
  await Promise.all(all.map((r) => r.close()));
}
