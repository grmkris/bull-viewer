import { FlowProducer } from "bullmq"
import IORedis from "ioredis"

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379"
const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null })

const flow = new FlowProducer({ connection })

const tree = await flow.add({
  name: "nightly-report",
  queueName: "reports",
  data: { kind: "rollup", day: "2026-04-13" },
  children: [
    {
      name: "fetch-orders",
      queueName: "reports",
      data: { source: "warehouse" },
    },
    {
      name: "build-pdf",
      queueName: "reports",
      data: { template: "weekly" },
      children: [
        { name: "render-page", queueName: "reports", data: { page: 1 } },
        { name: "render-page", queueName: "reports", data: { page: 2 } },
      ],
    },
    {
      name: "send-email",
      queueName: "reports",
      data: { to: "ceo@example.com" },
    },
  ],
})

console.log(`flow seeded — root id ${tree.job.id}`)

await flow.close()
connection.disconnect()
process.exit(0)
