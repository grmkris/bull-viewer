import type {
  JobListPage,
  JobSnapshot,
  JobState,
  QueueSnapshot,
  Scope,
  Viewer,
} from "@bull-viewer/core"

export interface JobsListParams {
  states?: JobState[]
  name?: string
  start?: number
  end?: number
}

export interface BulkActionRequest {
  action: "retry" | "remove" | "promote"
  ids?: string[]
  filter?: { states: JobState[]; nameFilter?: string }
  cap?: number
}

export interface BulkActionResponse {
  ok: boolean
  attempted: number
  succeeded: number
  failed: number
  errors: { id: string; reason: string }[]
}

export interface ApiClient {
  apiBase: string
  me(): Promise<{ viewer: Viewer | null; scopes: Scope[] }>
  listQueues(): Promise<{ queues: QueueSnapshot[] }>
  getQueue(name: string): Promise<{ queue: QueueSnapshot }>
  listJobs(name: string, params?: JobsListParams): Promise<JobListPage>
  getJob(name: string, id: string): Promise<{ job: JobSnapshot }>
  jobAction(
    name: string,
    id: string,
    action: "retry" | "remove" | "promote",
  ): Promise<{ ok: true } | { error: string }>
  bulkAction(name: string, body: BulkActionRequest): Promise<BulkActionResponse>
  /** Build the SSE URL for a queue. Caller wraps in EventSource. */
  eventsUrl(name: string): string
}

export function createApiClient(apiBase: string): ApiClient {
  const base = apiBase.endsWith("/") ? apiBase.slice(0, -1) : apiBase

  async function call<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(base + path, init)
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw new Error(`API ${res.status}: ${text}`)
    }
    return (await res.json()) as T
  }

  return {
    apiBase: base,
    me: () => call("/me"),
    listQueues: () => call("/queues"),
    getQueue: (name) => call(`/queues/${encodeURIComponent(name)}`),
    listJobs: (name, params = {}) => {
      const qs = new URLSearchParams()
      for (const s of params.states ?? []) qs.append("state", s)
      if (params.name) qs.set("name", params.name)
      if (params.start != null) qs.set("start", String(params.start))
      if (params.end != null) qs.set("end", String(params.end))
      const q = qs.toString()
      return call(`/queues/${encodeURIComponent(name)}/jobs${q ? `?${q}` : ""}`)
    },
    getJob: (name, id) =>
      call(`/queues/${encodeURIComponent(name)}/jobs/${encodeURIComponent(id)}`),
    jobAction: (name, id, action) =>
      call(
        `/queues/${encodeURIComponent(name)}/jobs/${encodeURIComponent(id)}/${action}`,
        { method: "POST" },
      ),
    bulkAction: (name, body) =>
      call(`/queues/${encodeURIComponent(name)}/jobs/bulk`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    eventsUrl: (name) => `${base}/queues/${encodeURIComponent(name)}/events`,
  }
}
