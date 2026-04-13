import type {
  JobListPage,
  JobSnapshot,
  QueueSnapshot,
  Scope,
  Viewer,
} from "@bull-viewer/core"

export interface ApiClient {
  me(): Promise<{ viewer: Viewer | null; scopes: Scope[] }>
  listQueues(): Promise<{ queues: QueueSnapshot[] }>
  getQueue(name: string): Promise<{ queue: QueueSnapshot }>
  listJobs(name: string, state: string, start?: number, end?: number): Promise<JobListPage>
  getJob(name: string, id: string): Promise<{ job: JobSnapshot }>
  jobAction(
    name: string,
    id: string,
    action: "retry" | "remove" | "promote",
  ): Promise<{ ok: true } | { error: string }>
}

export function createApiClient(apiBase: string): ApiClient {
  const base = apiBase.endsWith("/") ? apiBase.slice(0, -1) : apiBase

  async function call<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(base + path, init)
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw new Error(`API error ${res.status}: ${text}`)
    }
    return (await res.json()) as T
  }

  return {
    me: () => call("/me"),
    listQueues: () => call("/queues"),
    getQueue: (name) => call(`/queues/${encodeURIComponent(name)}`),
    listJobs: (name, state, start = 0, end = 19) =>
      call(
        `/queues/${encodeURIComponent(name)}/jobs?state=${encodeURIComponent(
          state,
        )}&start=${start}&end=${end}`,
      ),
    getJob: (name, id) =>
      call(
        `/queues/${encodeURIComponent(name)}/jobs/${encodeURIComponent(id)}`,
      ),
    jobAction: (name, id, action) =>
      call(
        `/queues/${encodeURIComponent(name)}/jobs/${encodeURIComponent(id)}/${action}`,
        { method: "POST" },
      ),
  }
}
