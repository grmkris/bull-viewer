/**
 * Pure helpers for parsing `BULL_VIEWER_TENANTS_JSON` and resolving the
 * default tenant id. Extracted from `index.ts` so they can be unit-tested
 * without booting Redis, IORedis, the metrics collector, or Hono.
 *
 * The instantiation of `IORedis` / `createRegistry` / `createMetricsCollector`
 * lives in `index.ts` and consumes whatever this file returns.
 */

export interface TenantJson {
  id: string;
  label?: string;
  redis: string;
  queues: string[];
}

export class TenantsConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantsConfigError";
  }
}

/**
 * Parse + validate the `BULL_VIEWER_TENANTS_JSON` env var contents. Throws
 * `TenantsConfigError` with a clear message on any structural problem; the
 * caller is expected to print the message and `process.exit(1)`.
 */
export function parseTenantsJson(raw: string): TenantJson[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new TenantsConfigError(
      `BULL_VIEWER_TENANTS_JSON is not valid JSON: ${(err as Error).message}`
    );
  }
  if (!Array.isArray(parsed)) {
    throw new TenantsConfigError(
      "BULL_VIEWER_TENANTS_JSON must be a JSON array"
    );
  }
  if (parsed.length === 0) {
    throw new TenantsConfigError(
      "BULL_VIEWER_TENANTS_JSON must contain at least one tenant"
    );
  }

  const seen = new Set<string>();
  for (const t of parsed as Record<string, unknown>[]) {
    if (typeof t.id !== "string" || !t.id) {
      throw new TenantsConfigError("each tenant requires a non-empty `id`");
    }
    if (seen.has(t.id)) {
      throw new TenantsConfigError(`duplicate tenant id "${t.id}"`);
    }
    seen.add(t.id);
    if (typeof t.redis !== "string" || !t.redis) {
      throw new TenantsConfigError(
        `tenant "${String(t.id)}" requires a \`redis\` URL`
      );
    }
    if (!Array.isArray(t.queues) || t.queues.length === 0) {
      throw new TenantsConfigError(
        `tenant "${String(t.id)}" requires a non-empty \`queues\` array`
      );
    }
    for (const q of t.queues) {
      if (typeof q !== "string" || !q) {
        throw new TenantsConfigError(
          `tenant "${String(t.id)}" has an invalid queue name`
        );
      }
    }
    if (t.label !== undefined && typeof t.label !== "string") {
      throw new TenantsConfigError(
        `tenant "${String(t.id)}" \`label\` must be a string when set`
      );
    }
  }
  return parsed as TenantJson[];
}

/**
 * Resolve which tenant id should serve as the default. Honors the explicit
 * env override; falls back to the first tenant in the parsed list.
 *
 * Throws if the explicit choice doesn't exist in the list — same fail-fast
 * stance as `normalizeTenantOptions` in `@grmkris/bull-viewer-api`.
 */
export function resolveDefaultTenantId(
  tenants: TenantJson[],
  explicit: string | undefined
): string {
  if (tenants.length === 0) {
    throw new TenantsConfigError("cannot resolve default from empty tenants");
  }
  if (explicit && explicit.trim()) {
    if (!tenants.some((t) => t.id === explicit)) {
      throw new TenantsConfigError(
        `BULL_VIEWER_DEFAULT_TENANT="${explicit}" not found in tenants list (have: ${tenants.map((t) => t.id).join(", ")})`
      );
    }
    return explicit;
  }
  return tenants[0]!.id;
}
