import { Queue } from "bullmq"
import type { ConnectionOptions } from "bullmq"

export interface RegistryOptions {
  connection: ConnectionOptions
  queues: string[]
}

export interface QueueRegistry {
  listQueueNames(): string[]
  getQueue(name: string): Queue | undefined
  close(): Promise<void>
}

const cache = new WeakMap<RegistryOptions, QueueRegistry>()

export function createRegistry(options: RegistryOptions): QueueRegistry {
  const cached = cache.get(options)
  if (cached) return cached

  const queues = new Map<string, Queue>()
  for (const name of options.queues) {
    queues.set(name, new Queue(name, { connection: options.connection }))
  }

  const registry: QueueRegistry = {
    listQueueNames() {
      return [...queues.keys()]
    },
    getQueue(name) {
      return queues.get(name)
    },
    async close() {
      await Promise.all([...queues.values()].map((q) => q.close()))
      queues.clear()
    },
  }

  cache.set(options, registry)
  return registry
}
