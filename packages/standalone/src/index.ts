#!/usr/bin/env bun
import {
  createQueuesApiHandler,
  type TenantConfig,
} from "@grmkris/bull-viewer-api";
import {
  createMetricsCollector,
  createRegistry,
  type MetricsCollector,
  type QueueRegistry,
} from "@grmkris/bull-viewer-core/server";
import { createBullViewerMcpHandler } from "@grmkris/bull-viewer-mcp";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import IORedis from "ioredis";

import { createAuthorize, type AuthMode } from "./auth.ts";
import { parseTenantsJson, resolveDefaultTenantId } from "./tenants.ts";

const PORT = Number(process.env.PORT ?? "3000");
const AUTH_MODE = (process.env.BULL_VIEWER_AUTH_MODE ?? "none") as AuthMode;

/**
 * Replace the password segment of a Redis connection URL with `***` so
 * boot-log lines don't leak credentials into whatever log aggregator the
 * operator is running (Datadog, CloudWatch, Loki, …). Leaves the scheme,
 * user, host, port, and path untouched. No-ops when the URL has no
 * password or isn't in `redis://` / `rediss://` form.
 */
function redactRedisUrl(url: string): string {
  return url.replace(/(rediss?:\/\/[^:/@]+:)([^@]+)(@)/, "$1***$3");
}
const UI_DIST =
  process.env.BULL_VIEWER_UI_DIST ??
  new URL("../../ui/dist/standalone/", import.meta.url).pathname;

interface ResolvedTenant {
  id: string;
  config: TenantConfig;
  connection: IORedis;
  registry: QueueRegistry;
  collector: MetricsCollector;
  redisUrl: string;
}

/**
 * Side-effectful — instantiates IORedis, creates registries + metrics
 * collectors. Pure parsing/validation lives in `./tenants.ts` (covered by
 * unit tests). This function only handles the wiring.
 */
function resolveTenants(): {
  tenants: Record<string, TenantConfig>;
  resolved: ResolvedTenant[];
  defaultTenant: string;
} {
  const tenantsJson = process.env.BULL_VIEWER_TENANTS_JSON;

  // Multi-tenant path
  if (tenantsJson?.trim()) {
    const list = parseTenantsJson(tenantsJson);
    const tenants: Record<string, TenantConfig> = {};
    const resolved: ResolvedTenant[] = [];
    for (const t of list) {
      const connection = new IORedis(t.redis, { maxRetriesPerRequest: null });
      const registry = createRegistry({ connection, queues: t.queues });
      const collector = createMetricsCollector({
        connection,
        queues: () => registry.getAll(),
      });
      const config: TenantConfig = {
        label: t.label ?? t.id,
        registry,
      };
      tenants[t.id] = config;
      resolved.push({
        id: t.id,
        config,
        connection,
        registry,
        collector,
        redisUrl: t.redis,
      });
    }
    const defaultTenant = resolveDefaultTenantId(
      list,
      process.env.BULL_VIEWER_DEFAULT_TENANT
    );
    return { tenants, resolved, defaultTenant };
  }

  // Legacy single-tenant path
  const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
  const queues = (process.env.BULL_VIEWER_QUEUES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (queues.length === 0) {
    console.warn(
      "[bull-viewer] BULL_VIEWER_QUEUES is empty; no queues will be visible. " +
        "Set BULL_VIEWER_TENANTS_JSON for multi-tenant mode."
    );
  }

  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const registry = createRegistry({ connection, queues });
  const collector = createMetricsCollector({
    connection,
    queues: () => registry.getAll(),
  });
  const config: TenantConfig = { label: "default", registry };
  return {
    tenants: { default: config },
    resolved: [
      {
        id: "default",
        config,
        connection,
        registry,
        collector,
        redisUrl,
      },
    ],
    defaultTenant: "default",
  };
}

let resolved: ResolvedTenant[];
let tenantsMap: Record<string, TenantConfig>;
let defaultTenant: string;
try {
  ({ tenants: tenantsMap, resolved, defaultTenant } = resolveTenants());
} catch (err) {
  console.error(`[bull-viewer] tenant config error: ${(err as Error).message}`);
  process.exit(1);
}

// Start one metrics collector per tenant
for (const t of resolved) {
  void t.collector.start();
}

const authorize = createAuthorize({
  mode: AUTH_MODE,
  user: process.env.BULL_VIEWER_AUTH_USER,
  pass: process.env.BULL_VIEWER_AUTH_PASS,
  tokens: process.env.BULL_VIEWER_AUTH_TOKENS?.split(",")
    .map((s) => s.trim())
    .filter(Boolean),
});

const apiHandler = createQueuesApiHandler({
  tenants: tenantsMap,
  defaultTenant,
  authorize,
  basePath: "/api",
  mcpHandler: createBullViewerMcpHandler(),
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
  await Promise.all(resolved.map((t) => t.collector.stop()));
  await Promise.all(resolved.map((t) => t.registry.close()));
  process.exit(0);
};
process.on("SIGINT", onShutdown);
process.on("SIGTERM", onShutdown);

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`[bull-viewer] listening on http://localhost:${info.port}`);
  if (resolved.length === 1 && resolved[0]!.id === "default") {
    console.log(
      `[bull-viewer] redis: ${redactRedisUrl(resolved[0]!.redisUrl)}`
    );
    console.log(
      `[bull-viewer] queues: ${resolved[0]!.registry.listQueueNames().join(", ") || "(none)"}`
    );
  } else {
    console.log(`[bull-viewer] tenants:`);
    const redacted = resolved.map((t) => ({
      ...t,
      redactedUrl: redactRedisUrl(t.redisUrl),
    }));
    const idWidth = Math.max(...redacted.map((t) => t.id.length));
    const urlWidth = Math.max(...redacted.map((t) => t.redactedUrl.length));
    for (const t of redacted) {
      const id = t.id.padEnd(idWidth);
      const url = t.redactedUrl.padEnd(urlWidth);
      const count = t.registry.listQueueNames().length;
      const arrow = t.id === defaultTenant ? "→" : " ";
      console.log(`  ${arrow} ${id}  ${url}  ${count} queues`);
    }
  }
  console.log(`[bull-viewer] auth: ${AUTH_MODE}`);
  console.log(`[bull-viewer] metrics collectors: ${resolved.length}`);
});
