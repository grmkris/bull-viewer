import type {
  JobListPage,
  JobSnapshot,
  JobState,
  QueueSnapshot,
  Scope,
  Viewer,
} from "@grmkris/bull-viewer-core";
// Type-only imports from @grmkris/bull-viewer-core/server are **erased at build
// time** and add zero runtime cost — no ioredis / bullmq code is pulled
// into the browser bundle. Gives us a single source of truth for the
// shapes the UI consumes via the typed oRPC client.
import type {
  MetricBucket,
  FlowGraph,
  FlowNode,
  FlowEdge,
} from "@grmkris/bull-viewer-core/server";

import {
  createOrpcClient,
  type BullViewerClient,
  type OrpcClientBundle,
} from "./lib/orpc-client.ts";

// Re-export so existing consumers keep importing from api-client.ts
export type { MetricBucket, FlowGraph, FlowNode, FlowEdge };

export type MetricsRange = "15m" | "1h" | "6h" | "24h" | "7d";

export interface JobsListParams {
  states?: JobState[];
  name?: string;
  start?: number;
  end?: number;
}

export interface BulkActionRequest {
  action: "retry" | "remove" | "promote";
  ids?: string[];
  filter?: { states: JobState[]; nameFilter?: string };
  cap?: number;
}

export interface BulkActionResponse {
  ok: boolean;
  attempted: number;
  succeeded: number;
  failed: number;
  errors: { id: string; reason: string }[];
}

export interface SearchResult {
  jobs: JobSnapshot[];
  truncated: boolean;
  scanned: number;
  durationMs: number;
}

/**
 * High-level UI client. Preserves the original `ApiClient` shape so the
 * existing React pages / drawers / sidebars don't need to change, while
 * every method under the hood routes through the typed oRPC client.
 *
 * The raw oRPC `client` and TanStack Query `orpc` utils are also exposed
 * so new features can call procedures directly with full typing.
 */
export interface ApiClient {
  apiBase: string;
  client: BullViewerClient;
  orpc: OrpcClientBundle["orpc"];
  me(): Promise<{ viewer: Viewer | null; scopes: Scope[] }>;
  listQueues(): Promise<{ queues: QueueSnapshot[] }>;
  getQueue(name: string): Promise<{ queue: QueueSnapshot }>;
  listJobs(name: string, params?: JobsListParams): Promise<JobListPage>;
  getJob(name: string, id: string): Promise<{ job: JobSnapshot }>;
  /**
   * Throws the raw `ORPCError` from the server on failure — callers must
   * wrap in `try/catch` + toast. Previously this swallowed errors into a
   * `{ error: string }` union, which was silently inconsistent with every
   * other method and masked "success" vs "hid an error".
   */
  jobAction(
    name: string,
    id: string,
    action: "retry" | "remove" | "promote"
  ): Promise<{ ok: true }>;
  bulkAction(
    name: string,
    body: BulkActionRequest
  ): Promise<BulkActionResponse>;
  searchJobs(
    name: string,
    query: string,
    options?: { limit?: number; signal?: AbortSignal; states?: JobState[] }
  ): Promise<SearchResult>;
  getFlow(name: string, id: string): Promise<FlowGraph>;
  getMetrics(
    name: string,
    range: MetricsRange
  ): Promise<{ buckets: MetricBucket[] }>;
  /** Build the SSE URL for a queue. Caller wraps in EventSource. */
  eventsUrl(name: string): string;
}

export function createApiClient(apiBase: string, tenantId: string): ApiClient {
  const base = apiBase.endsWith("/") ? apiBase.slice(0, -1) : apiBase;
  const { client, orpc } = createOrpcClient(base, tenantId);

  return {
    apiBase: base,
    client,
    orpc,

    me: () => client.me(),
    listQueues: () => client.queues.list(),
    getQueue: (name) => client.queues.get({ name }),

    listJobs: (name, params = {}) =>
      client.jobs.list({
        name,
        states: params.states,
        nameFilter: params.name,
        start: params.start ?? 0,
        end: params.end ?? 49,
      }),

    getJob: (name, id) => client.jobs.get({ name, id }),

    // Propagate ORPCError so React's error boundaries + TanStack Query's
    // `QueryCache.onError` (follow-up M7) can see the structured error.
    // JobDrawer already wraps the call in try/catch + sonner toast.
    jobAction: async (name, id, action) => {
      await client.jobs.action({ name, id, action });
      return { ok: true as const };
    },

    // No `as Promise<T>` casts — the typed oRPC client already returns
    // exactly the server-declared shape. If a field drifts, the compile
    // error should surface, not be papered over.
    bulkAction: (name, body) =>
      client.queues.bulk({
        name,
        action: body.action,
        ids: body.ids,
        filter: body.filter,
        cap: body.cap,
      }),

    searchJobs: (name, query, options = {}) =>
      client.search.jobs(
        {
          name,
          query,
          states: options.states,
          limit: options.limit ?? 20,
        },
        { signal: options.signal }
      ),

    getFlow: (name, id) => client.jobs.flow({ name, id }),

    getMetrics: (name, range) => client.metrics.get({ name, range }),

    eventsUrl: (name) =>
      `${base}/tenants/${encodeURIComponent(tenantId)}/queues/${encodeURIComponent(name)}/events`,
  };
}
