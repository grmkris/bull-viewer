import IORedis from "ioredis";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6390";

declare global {
  // eslint-disable-next-line no-var
  var __bull_viewer_redis__: IORedis | undefined;
}

export const redis: IORedis =
  globalThis.__bull_viewer_redis__ ??
  new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

if (process.env.NODE_ENV !== "production") {
  globalThis.__bull_viewer_redis__ = redis;
}
