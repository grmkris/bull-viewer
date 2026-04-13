import { z } from "zod"

export const JOB_STATES = [
  "waiting",
  "active",
  "completed",
  "failed",
  "delayed",
  "paused",
  "prioritized",
  "waiting-children",
] as const

export type JobStateFilter = (typeof JOB_STATES)[number]

export const TIME_RANGES = ["15m", "1h", "6h", "24h", "7d"] as const
export type TimeRange = (typeof TIME_RANGES)[number]

export const jobsSearchSchema = z.object({
  states: z
    .array(z.enum(JOB_STATES))
    .optional()
    .default(["failed", "active", "waiting"]),
  name: z.string().optional(),
  q: z.string().optional(),
  range: z.enum(TIME_RANGES).optional().default("1h"),
  cursor: z.coerce.number().int().min(0).optional().default(0),
  job: z.string().optional(), // open job in drawer
})

export type JobsSearch = z.infer<typeof jobsSearchSchema>
