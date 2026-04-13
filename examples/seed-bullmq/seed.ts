import { Queue, Worker } from "bullmq"
import IORedis from "ioredis"

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379"
const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null })

const emails = new Queue("emails", { connection })
const reports = new Queue("reports", { connection })

await emails.drain(true)
await reports.drain(true)

// waiting jobs
for (let i = 0; i < 5; i++) {
  await emails.add("send-welcome", { to: `user${i}@example.com`, body: "hi" })
}
for (let i = 0; i < 3; i++) {
  await reports.add("daily-summary", { day: `2026-04-${10 + i}` })
}

// delayed
for (let i = 0; i < 2; i++) {
  await emails.add(
    "send-followup",
    { to: `user${i}@example.com` },
    { delay: 60_000 },
  )
}

// completed + failed via a temporary worker
const emailWorker = new Worker(
  "emails",
  async (job) => {
    if (job.name === "fail-me") throw new Error("intentional failure for demo")
    return { sent: true, name: job.data.to }
  },
  { connection },
)

const reportWorker = new Worker(
  "reports",
  async () => ({ rows: 42 }),
  { connection },
)

for (let i = 0; i < 4; i++) {
  await emails.add("send-archive", { to: `archive${i}@example.com` })
}
for (let i = 0; i < 3; i++) {
  await emails.add("fail-me", { to: `bad${i}@example.com` }, { attempts: 1 })
}
for (let i = 0; i < 5; i++) {
  await reports.add("weekly-summary", { week: i })
}

// give the workers a moment to drain the completed/failed buffers
await new Promise((r) => setTimeout(r, 1500))

await emailWorker.close()
await reportWorker.close()
await emails.close()
await reports.close()
await connection.quit()

console.log("seeded ✔")
