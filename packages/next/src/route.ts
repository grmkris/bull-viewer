import "server-only";
import {
  createQueuesApiHandler,
  type Authorize,
  type McpRequestHandler,
  type TenantConfig,
} from "@grmkris/bull-viewer-api";
import { createRegistry } from "@grmkris/bull-viewer-core/server";
import { createBullViewerMcpHandler } from "@grmkris/bull-viewer-mcp";
import type { ConnectionOptions } from "bullmq";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Per-tenant config — connection + queues + optional label. The Next adapter
 * calls `createRegistry` for each entry internally; callers don't need to
 * touch the registry API directly.
 */
export interface NextTenantConfig {
  label?: string;
  connection: ConnectionOptions;
  queues: string[];
}

export interface CreateQueuesRouteHandlersOptions {
  /**
   * Multi-tenant mode. Map of `id → { connection, queues, label? }`. The
   * adapter creates one `QueueRegistry` per tenant. The picker in the UI
   * shows `label` (or the id when no label is set).
   */
  tenants?: Record<string, NextTenantConfig>;
  /** Which tenant id is the initial selection. Defaults to the first key. */
  defaultTenant?: string;

  /**
   * Single-tenant mode (legacy). Equivalent to passing a one-entry
   * `tenants` map under id `"default"`.
   */
  connection?: ConnectionOptions;
  queues?: string[];

  basePath?: string;
  authorize?: Authorize;
  readOnly?: boolean;
  /**
   * Expose the MCP Streamable HTTP endpoint at
   * `${basePath}/tenants/:id/mcp` (and the legacy `${basePath}/mcp` alias).
   * Reuses the same `authorize` + scope middleware as the rest of the
   * dashboard, so AI agents are governed by the same permissions as the UI.
   *
   * Default: `true`. Set `false` to disable the MCP endpoint entirely.
   */
  mcp?: boolean;
}

type Handler = (req: Request) => Promise<Response>;

export interface QueuesRouteHandlers {
  GET: Handler;
  POST: Handler;
  PATCH: Handler;
  DELETE: Handler;
}

function buildTenants(
  options: CreateQueuesRouteHandlersOptions
): { tenants: Record<string, TenantConfig>; defaultTenant: string } | null {
  if (options.tenants && Object.keys(options.tenants).length > 0) {
    const tenants: Record<string, TenantConfig> = {};
    for (const [id, t] of Object.entries(options.tenants)) {
      tenants[id] = {
        label: t.label,
        registry: createRegistry({
          connection: t.connection,
          queues: t.queues,
        }),
      };
    }
    const defaultTenant =
      options.defaultTenant ?? Object.keys(options.tenants)[0]!;
    return { tenants, defaultTenant };
  }
  return null;
}

export function createQueuesRouteHandlers(
  options: CreateQueuesRouteHandlersOptions
): QueuesRouteHandlers {
  const multi = buildTenants(options);

  const mcpHandler: McpRequestHandler | undefined =
    (options.mcp ?? true) ? createBullViewerMcpHandler() : undefined;

  const handler = multi
    ? createQueuesApiHandler({
        tenants: multi.tenants,
        defaultTenant: multi.defaultTenant,
        authorize: options.authorize,
        basePath: options.basePath,
        readOnly: options.readOnly,
        mcpHandler,
      })
    : createQueuesApiHandler({
        registry: createRegistry({
          connection: options.connection!,
          queues: options.queues!,
        }),
        authorize: options.authorize,
        basePath: options.basePath,
        readOnly: options.readOnly,
        mcpHandler,
      });

  return {
    GET: handler,
    POST: handler,
    PATCH: handler,
    DELETE: handler,
  };
}
