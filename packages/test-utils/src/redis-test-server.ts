import { RedisMemoryServer } from "redis-memory-server";

/**
 * A throwaway Redis instance backed by a real `redis-server` binary.
 *
 * The first invocation downloads + caches the binary into
 * `~/.cache/redis-binaries/`; subsequent runs are instant. This is the same
 * pattern used by `ai-stilist` and `appmisha.com` — it lets every test
 * suite run against a real Redis (so BullMQ's Lua scripts execute
 * correctly) without any Docker / testcontainers / system-redis dance.
 */
export interface RedisTestSetup {
  server: RedisMemoryServer;
  host: string;
  port: number;
  url: string;
  shutdown: () => Promise<void>;
}

export async function createTestRedisSetup(): Promise<RedisTestSetup> {
  // `.create()` is the documented atomic init — avoids races between
  // `new RedisMemoryServer()` + `.start()` that have bitten older
  // versions when concurrent tests construct multiple instances.
  const server = await RedisMemoryServer.create();
  const host = await server.getHost();
  const port = await server.getPort();
  return {
    server,
    host,
    port,
    url: `redis://${host}:${port}`,
    shutdown: async () => {
      await server.stop();
    },
  };
}

/**
 * Memoized variant — returns the same `RedisTestSetup` for every caller in
 * the current process. Useful for cross-file test sharing where booting a
 * separate redis-server per file would dominate wall-clock time. The
 * server is only stopped on `process.beforeExit`, never explicitly.
 *
 * Mirrors `appmisha.com/packages/test-utils/src/redis-test-server.ts`.
 */
let sharedSetup: RedisTestSetup | null = null;
let sharedPromise: Promise<RedisTestSetup> | null = null;

export function getSharedRedisSetup(): Promise<RedisTestSetup> {
  if (sharedSetup) return Promise.resolve(sharedSetup);
  if (sharedPromise) return sharedPromise;
  sharedPromise = (async () => {
    const setup = await createTestRedisSetup();
    sharedSetup = {
      ...setup,
      shutdown: async () => {
        // No-op for shared setup — process exit handles cleanup so multiple
        // test files can share the same server without races.
      },
    };
    return sharedSetup;
  })();
  return sharedPromise;
}

if (typeof process !== "undefined") {
  process.on("beforeExit", async () => {
    if (sharedSetup) {
      await sharedSetup.server.stop();
      sharedSetup = null;
      sharedPromise = null;
    }
  });
}
