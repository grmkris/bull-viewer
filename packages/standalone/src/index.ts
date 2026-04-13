#!/usr/bin/env bun
import { createQueuesApiHandler } from "@bull-viewer/api";
import {
  createMetricsCollector,
  createRegistry,
} from "@bull-viewer/core/server";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import IORedis from "ioredis";

import { createAuthorize, type AuthMode } from "./auth.ts";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const QUEUES = (process.env.BULL_VIEWER_QUEUES ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const PORT = Number(process.env.PORT ?? "3000");
const AUTH_MODE = (process.env.BULL_VIEWER_AUTH_MODE ?? "none") as AuthMode;
const UI_DIST =
  process.env.BULL_VIEWER_UI_DIST ??
  new URL("../../ui/dist/standalone/", import.meta.url).pathname;

if (QUEUES.length === 0) {
  console.warn(
    "[bull-viewer] BULL_VIEWER_QUEUES is empty; no queues will be visible"
  );
}

const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
const registry = createRegistry({ connection, queues: QUEUES });

// Start metrics collector — subscribes to QueueEvents + 60s snapshot interval
const collector = createMetricsCollector({
  connection,
  queues: () => registry.getAll(),
});
void collector.start();

const authorize = createAuthorize({
  mode: AUTH_MODE,
  user: process.env.BULL_VIEWER_AUTH_USER,
  pass: process.env.BULL_VIEWER_AUTH_PASS,
  tokens: process.env.BULL_VIEWER_AUTH_TOKENS?.split(",")
    .map((s) => s.trim())
    .filter(Boolean),
});

const apiHandler = createQueuesApiHandler({
  registry,
  authorize,
  basePath: "/api",
});

const app = new Hono();

app.all("/api/*", async (c) => {
  return apiHandler(c.req.raw);
});

app.use(
  "/*",
  serveStatic({
    root: UI_DIST,
    rewriteRequestPath: (path) => (path === "/" ? "/index.html" : path),
  })
);

app.notFound(async (c) => {
  const html = await Bun.file(`${UI_DIST}/index.html`).text();
  return c.html(html);
});

const onShutdown = async () => {
  await collector.stop();
  await registry.close();
  process.exit(0);
};
process.on("SIGINT", onShutdown);
process.on("SIGTERM", onShutdown);

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`[bull-viewer] listening on http://localhost:${info.port}`);
  console.log(`[bull-viewer] redis: ${REDIS_URL}`);
  console.log(`[bull-viewer] queues: ${QUEUES.join(", ") || "(none)"}`);
  console.log(`[bull-viewer] auth: ${AUTH_MODE}`);
  console.log(`[bull-viewer] metrics collector: started`);
});
