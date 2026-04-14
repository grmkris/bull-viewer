import { Queue } from "bullmq";
import IORedis from "ioredis";

const connection = new IORedis(process.env.REDIS_URL ?? "redis://redis:6379", {
  maxRetriesPerRequest: null,
});

const emails = new Queue("emails", { connection });
const reports = new Queue("reports", { connection });

for (let i = 0; i < 20; i++) {
  await emails.add("send-welcome", { to: `user${i}@example.com` });
}
for (let i = 0; i < 5; i++) {
  await reports.add("weekly-digest", { week: i });
}

console.log("seeded 20 emails + 5 reports");
await connection.quit();
