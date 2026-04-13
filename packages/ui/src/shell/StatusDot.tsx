import { cn } from "@/lib/utils"
import type { JobState } from "@bull-viewer/core"

const STATE_TO_VAR: Record<string, string> = {
  waiting: "var(--status-waiting)",
  active: "var(--status-active)",
  completed: "var(--status-completed)",
  failed: "var(--status-failed)",
  delayed: "var(--status-delayed)",
  paused: "var(--status-paused)",
  stalled: "var(--status-stalled)",
  "waiting-children": "var(--status-children)",
}

export interface StatusDotProps {
  state: JobState | "stalled" | string
  size?: number
  /** Show a conic-gradient ring filled by `progress` (0..1) — used for running attempt progress. */
  progress?: number
  className?: string
}

/**
 * Status indicator dot.
 *
 * - Solid filled circle for terminal states (completed/failed/waiting/etc).
 * - For `active`, renders an SVG with a thin conic-gradient ring around it.
 *   When `progress` is provided (0..1), the ring is filled clockwise to that
 *   fraction — i.e. `attemptsMade / opts.attempts`. Otherwise the ring spins.
 */
export function StatusDot({
  state,
  size = 10,
  progress,
  className,
}: StatusDotProps) {
  const color = STATE_TO_VAR[state] ?? "var(--status-waiting)"
  const isActive = state === "active"

  if (!isActive) {
    return (
      <span
        aria-label={`status ${state}`}
        className={cn("inline-block rounded-full", className)}
        style={{
          width: size,
          height: size,
          backgroundColor: color,
          transition: "background-color 600ms ease-out",
        }}
      />
    )
  }

  // Active: SVG ring + inner dot
  const ringSize = size + 6
  const center = ringSize / 2
  const radius = center - 1.25
  const stroke = 2
  const circumference = 2 * Math.PI * radius
  const determinate = progress != null && progress >= 0 && progress <= 1
  const dashOffset = determinate ? circumference * (1 - progress!) : 0

  return (
    <span
      aria-label={`status active${determinate ? ` ${Math.round((progress ?? 0) * 100)}%` : ""}`}
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: ringSize, height: ringSize }}
    >
      <svg
        width={ringSize}
        height={ringSize}
        viewBox={`0 0 ${ringSize} ${ringSize}`}
        className={determinate ? undefined : "bv-spin"}
        style={{ position: "absolute", inset: 0 }}
      >
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeOpacity={0.18}
          strokeWidth={stroke}
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={determinate ? `${circumference}` : `${circumference * 0.25} ${circumference}`}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${center} ${center})`}
        />
      </svg>
      <span
        className="bv-pulse rounded-full"
        style={{
          width: size - 2,
          height: size - 2,
          backgroundColor: color,
        }}
      />
    </span>
  )
}
