import type { Queue, Job } from "bullmq";

import type { JobState } from "../types.ts";

export interface FlowNode {
  id: string;
  queue: string;
  name: string;
  state: JobState | "unknown";
  attemptsMade: number;
  maxAttempts?: number;
  timestamp: number;
  processedOn: number | null;
  finishedOn: number | null;
  parentId: string | null;
  durationMs: number | null;
  external: boolean;
}

export interface FlowEdge {
  from: string;
  to: string;
}

export interface FlowGraph {
  rootId: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
}

const KEY_RE = /^bull:([^:]+):(.+)$/;

function parseKey(key: string): { queue: string; id: string } | null {
  const m = key.match(KEY_RE);
  if (!m) return null;
  return { queue: m[1]!, id: m[2]! };
}

function maxAttemptsOf(opts: unknown): number | undefined {
  if (opts && typeof opts === "object" && "attempts" in opts) {
    const v = (opts as { attempts?: unknown }).attempts;
    if (typeof v === "number") return v;
  }
  return undefined;
}

async function nodeFromJob(
  job: Job,
  queueName: string,
  parentId: string | null,
  external: boolean
): Promise<FlowNode> {
  let state: JobState | "unknown" = "unknown";
  try {
    state = (await job.getState()) as JobState | "unknown";
  } catch {
    /* swallow */
  }
  const dur =
    job.processedOn != null && job.finishedOn != null
      ? job.finishedOn - job.processedOn
      : null;
  return {
    id: String(job.id),
    queue: queueName,
    name: job.name,
    state,
    attemptsMade: job.attemptsMade,
    maxAttempts: maxAttemptsOf(job.opts),
    timestamp: job.timestamp,
    processedOn: job.processedOn ?? null,
    finishedOn: job.finishedOn ?? null,
    parentId,
    durationMs: dur,
    external,
  };
}

const MAX_DEPTH = 6;
const MAX_NODES = 1000;

/**
 * Walks down from `rootId` building a flow tree.
 *
 * - Uses BullMQ `getDependencies()` to enumerate children
 * - Same-queue children are resolved via `queue.getJob(childId)`
 * - Cross-queue children are recorded as `external: true` placeholder nodes
 * - Bounded by MAX_DEPTH and MAX_NODES to prevent runaway walks
 */
export async function getFlow(
  queue: Queue,
  rootId: string
): Promise<FlowGraph | null> {
  const root = await queue.getJob(rootId);
  if (!root) return null;

  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];
  const seen = new Set<string>();

  const visit = async (
    job: Job,
    parentId: string | null,
    depth: number
  ): Promise<void> => {
    if (depth > MAX_DEPTH || nodes.length >= MAX_NODES) return;
    const id = String(job.id);
    if (seen.has(id)) return;
    seen.add(id);

    nodes.push(await nodeFromJob(job, queue.name, parentId, false));

    let deps: { processed?: Record<string, unknown>; unprocessed?: string[] };
    try {
      deps = await job.getDependencies();
    } catch {
      return;
    }

    const childKeys = [
      ...(deps.processed ? Object.keys(deps.processed) : []),
      ...(deps.unprocessed ?? []),
    ];

    for (const childKey of childKeys) {
      const parsed = parseKey(childKey);
      if (!parsed) continue;
      edges.push({ from: id, to: parsed.id });
      if (parsed.queue !== queue.name) {
        // Cross-queue child — placeholder external node
        nodes.push({
          id: parsed.id,
          queue: parsed.queue,
          name: "(external)",
          state: "unknown",
          attemptsMade: 0,
          timestamp: 0,
          processedOn: null,
          finishedOn: null,
          parentId: id,
          durationMs: null,
          external: true,
        });
        continue;
      }
      const child = await queue.getJob(parsed.id);
      if (!child) continue;
      await visit(child, id, depth + 1);
    }
  };

  await visit(root, null, 0);
  return { rootId, nodes, edges };
}

/** Find the topmost ancestor by walking parentKey upward (capped). */
export async function findFlowRoot(
  queue: Queue,
  jobId: string,
  maxHops = MAX_DEPTH
): Promise<string | null> {
  let current = await queue.getJob(jobId);
  if (!current) return null;
  let hops = 0;
  while (current && hops < maxHops) {
    const parentKey = (current as unknown as { parentKey?: string }).parentKey;
    if (!parentKey) return String(current.id);
    const parsed = parseKey(parentKey);
    if (!parsed) return String(current.id);
    if (parsed.queue !== queue.name) return String(current.id);
    const parent = await queue.getJob(parsed.id);
    if (!parent) return String(current.id);
    current = parent;
    hops++;
  }
  return current ? String(current.id) : null;
}
