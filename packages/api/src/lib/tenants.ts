import type { QueueRegistry, SearchProvider } from "@grmkris/bull-viewer-core/server";

/**
 * One tenant = one Redis target + a set of queue names exposed by it.
 *
 * The `registry` carries the live BullMQ Queue handles; `label` is what
 * the UI tenant switcher renders. `searchProvider` lets a host inject a
 * Postgres / Meilisearch / Elastic adapter for that one tenant only,
 * overriding the handler-level default.
 */
export interface TenantConfig {
  label?: string;
  registry: QueueRegistry;
  searchProvider?: SearchProvider;
}

/**
 * Multi-tenant or legacy single-tenant input to `createQueuesApiHandler`.
 *
 * Exactly one of `tenants` or `registry` must be provided — the
 * normalizer rejects ambiguous input at handler-factory time.
 */
export interface TenantOptionsInput {
  /** Multi-tenant mode: a map of `id → config`. */
  tenants?: Record<string, TenantConfig>;
  /**
   * Which tenant id is the default (used by legacy `/rpc/*` paths and as
   * the initial selection in the UI). When omitted, the first key of the
   * `tenants` map (insertion order) is used.
   */
  defaultTenant?: string;

  /**
   * Legacy single-tenant mode. Equivalent to:
   * `tenants: { default: { registry, searchProvider } }`.
   */
  registry?: QueueRegistry;
  searchProvider?: SearchProvider;
}

/**
 * Internal shape used by the dispatcher. Single-tenant input is wrapped
 * in a one-entry map so the rest of the handler treats both modes the
 * same way.
 */
export interface NormalizedTenants {
  tenants: Map<string, TenantConfig>;
  defaultTenantId: string;
}

export class TenantOptionsError extends Error {
  constructor(message: string) {
    super(`[bull-viewer] tenant config: ${message}`);
    this.name = "TenantOptionsError";
  }
}

const TENANT_ID_RE = /^[A-Za-z0-9_-]+$/;

export function normalizeTenantOptions(
  input: TenantOptionsInput
): NormalizedTenants {
  const hasTenants = !!input.tenants && Object.keys(input.tenants).length > 0;
  const hasRegistry = !!input.registry;

  if (hasTenants && hasRegistry) {
    throw new TenantOptionsError(
      "specify either `tenants` (multi-tenant) OR `registry` (single-tenant), not both"
    );
  }
  if (!(hasTenants || hasRegistry)) {
    throw new TenantOptionsError(
      "missing config — provide `tenants: { id: { registry } }` or `registry: createRegistry(...)`"
    );
  }

  if (hasTenants) {
    const entries = Object.entries(
      input.tenants as Record<string, TenantConfig>
    );
    const tenants = new Map<string, TenantConfig>();
    for (const [id, config] of entries) {
      if (!TENANT_ID_RE.test(id)) {
        throw new TenantOptionsError(
          `tenant id "${id}" is invalid — must match ${TENANT_ID_RE.source}`
        );
      }
      if (tenants.has(id)) {
        throw new TenantOptionsError(`duplicate tenant id "${id}"`);
      }
      if (!config?.registry) {
        throw new TenantOptionsError(
          `tenant "${id}" missing required \`registry\``
        );
      }
      tenants.set(id, config);
    }

    const defaultTenantId = input.defaultTenant ?? entries[0]![0];
    if (!tenants.has(defaultTenantId)) {
      throw new TenantOptionsError(
        `defaultTenant "${defaultTenantId}" is not in tenants map (have: ${[...tenants.keys()].join(", ")})`
      );
    }
    return { tenants, defaultTenantId };
  }

  // Legacy single-tenant — wrap in a one-entry map under id "default".
  const tenants = new Map<string, TenantConfig>([
    [
      "default",
      {
        label: "default",
        registry: input.registry as QueueRegistry,
        searchProvider: input.searchProvider,
      },
    ],
  ]);
  return { tenants, defaultTenantId: "default" };
}
