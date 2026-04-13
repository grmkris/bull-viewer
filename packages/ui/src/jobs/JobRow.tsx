import type { JobSnapshot } from "@bull-viewer/core";
import { formatDistanceToNowStrict } from "date-fns";
import { memo } from "react";

import { cn } from "@/lib/utils";

import { StatusDot } from "../shell/StatusDot.tsx";

interface JobRowProps {
  job: JobSnapshot;
  selected: boolean;
  active: boolean;
  multiSelected: boolean;
  onClick: (id: string, event: React.MouseEvent) => void;
  onToggle: (id: string) => void;
  showCheckbox: boolean;
}

const optsAttempts = (opts: unknown): number | undefined => {
  if (opts && typeof opts === "object" && "attempts" in opts) {
    const v = (opts as { attempts?: unknown }).attempts;
    if (typeof v === "number") return v;
  }
  return undefined;
};

export const JobRow = memo(function JobRow({
  job,
  selected,
  active,
  multiSelected,
  onClick,
  onToggle,
  showCheckbox,
}: JobRowProps) {
  const maxAttempts = optsAttempts(job.opts);
  const isActive = job.state === "active";
  const isFailed = job.state === "failed";
  const attemptDisplay = maxAttempts
    ? `${job.attemptsMade}/${maxAttempts}`
    : `${job.attemptsMade}`;
  const atMax = maxAttempts ? job.attemptsMade >= maxAttempts : false;

  const duration =
    job.finishedOn && job.processedOn
      ? `${((job.finishedOn - job.processedOn) / 1000).toFixed(1)}s`
      : isActive && job.processedOn
        ? `${((Date.now() - job.processedOn) / 1000).toFixed(1)}s`
        : "—";

  const ageMs = Date.now() - job.timestamp;
  const age =
    ageMs < 60_000
      ? `${Math.round(ageMs / 1000)}s ago`
      : formatDistanceToNowStrict(job.timestamp, { addSuffix: true });

  return (
    <div
      role="row"
      aria-selected={selected || active}
      onClick={(e) => onClick(job.id, e)}
      className={cn(
        "group relative flex items-center gap-3 border-b px-3 text-[13px] tnum cursor-pointer",
        "hover:bg-muted/30 transition-colors",
        active && "bg-muted/50",
        multiSelected && "bg-signal/10"
      )}
      style={{ height: "var(--row-height)" }}
    >
      {/* Checkbox column */}
      <div
        className={cn(
          "shrink-0 w-4 flex items-center justify-center",
          showCheckbox || multiSelected
            ? "opacity-100"
            : "opacity-0 group-hover:opacity-100"
        )}
        onClick={(e) => {
          e.stopPropagation();
          onToggle(job.id);
        }}
      >
        <input
          type="checkbox"
          checked={multiSelected}
          onChange={() => onToggle(job.id)}
          aria-label={`select job ${job.id}`}
          className="size-3.5 rounded-sm accent-signal"
        />
      </div>

      {/* State dot */}
      <div className="shrink-0 w-4 flex items-center justify-center">
        <StatusDot
          state={job.state}
          size={isActive ? 10 : 9}
          progress={
            isActive && maxAttempts ? job.attemptsMade / maxAttempts : undefined
          }
        />
      </div>

      {/* Job ID */}
      <div className="shrink-0 w-28 truncate font-mono text-muted-foreground tnum">
        #{job.id}
      </div>

      {/* Name */}
      <div className="flex-1 min-w-0 truncate font-mono text-foreground">
        {job.name}
        {isFailed && job.failedReason && (
          <span className="ml-2 text-status-failed text-[11px] truncate">
            {job.failedReason}
          </span>
        )}
      </div>

      {/* Age — col-age */}
      <div className="col-age shrink-0 w-24 text-right text-muted-foreground tnum text-[11px]">
        {age}
      </div>

      {/* Attempts — col-attempts */}
      <div
        className={cn(
          "col-attempts shrink-0 w-12 text-right tnum text-[11px]",
          atMax ? "text-status-failed font-semibold" : "text-muted-foreground"
        )}
      >
        {attemptDisplay}
      </div>

      {/* Duration — col-duration */}
      <div className="col-duration shrink-0 w-16 text-right text-muted-foreground tnum text-[11px]">
        {duration}
      </div>
    </div>
  );
});
