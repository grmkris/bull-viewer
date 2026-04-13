"use client";

import { ChevronDownIcon, ChevronRightIcon, CopyIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";

interface StackFrame {
  raw: string;
  fn?: string;
  file?: string;
  line?: number;
  col?: number;
  inApp: boolean;
}

const NODE_INTERNALS = new Set([
  "node:internal",
  "node:events",
  "node:fs",
  "node:net",
  "node:tls",
  "node:http",
  "node:async_hooks",
  "node:process",
]);

function isInApp(file: string | undefined): boolean {
  if (!file) return false;
  if (file.includes("node_modules/")) return false;
  for (const prefix of NODE_INTERNALS) {
    if (file.startsWith(prefix)) return false;
  }
  if (file.startsWith("node:")) return false;
  return true;
}

function parseFrame(line: string): StackFrame {
  // Match patterns like:
  //   at functionName (path/to/file.ts:42:18)
  //   at path/to/file.ts:42:18
  //   at <anonymous> (file.js:10:5)
  const m1 = line.match(/^\s*at\s+(.+?)\s+\((.+):(\d+):(\d+)\)\s*$/);
  const m2 = line.match(/^\s*at\s+(.+):(\d+):(\d+)\s*$/);
  if (m1) {
    return {
      raw: line,
      fn: m1[1],
      file: m1[2],
      line: Number(m1[3]),
      col: Number(m1[4]),
      inApp: isInApp(m1[2]),
    };
  }
  if (m2) {
    return {
      raw: line,
      file: m2[1],
      line: Number(m2[2]),
      col: Number(m2[3]),
      inApp: isInApp(m2[1]),
    };
  }
  return { raw: line, inApp: false };
}

interface StackTraceViewerProps {
  message: string | null;
  stacktrace: string[];
}

export function StackTraceViewer({
  message,
  stacktrace,
}: StackTraceViewerProps) {
  // Stacktrace strings from BullMQ are usually formatted as multi-line strings.
  // We split each entry by newline so each "at ..." is its own frame.
  const frames = useMemo(() => {
    const out: StackFrame[] = [];
    for (const entry of stacktrace) {
      for (const line of entry.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("Error:")) continue;
        out.push(parseFrame(line));
      }
    }
    return out;
  }, [stacktrace]);

  // Group consecutive framework frames together
  const groups = useMemo(() => {
    const result: Array<
      | { type: "frame"; frame: StackFrame; index: number }
      | { type: "framework"; frames: StackFrame[] }
    > = [];
    let buffer: StackFrame[] = [];
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i]!;
      if (f.inApp) {
        if (buffer.length > 0) {
          result.push({ type: "framework", frames: buffer });
          buffer = [];
        }
        result.push({ type: "frame", frame: f, index: i });
      } else {
        buffer.push(f);
      }
    }
    if (buffer.length > 0) result.push({ type: "framework", frames: buffer });
    return result;
  }, [frames]);

  const copyAll = () => {
    const out = [message ?? "", ...stacktrace].filter(Boolean).join("\n");
    navigator.clipboard.writeText(out).then(
      () => toast.success("stack copied"),
      () => toast.error("copy failed")
    );
  };

  return (
    <div className="bg-status-failed/10 rounded-sm border border-status-failed/20">
      <div className="flex items-center justify-between border-b border-status-failed/20 px-2 py-1 font-sans text-[10px] uppercase tracking-wide text-status-failed">
        <span>failure</span>
        <button
          type="button"
          onClick={copyAll}
          className="hover:text-foreground transition-colors"
          aria-label="copy entire stack"
        >
          <CopyIcon className="size-3" />
        </button>
      </div>
      {message && (
        <div className="text-status-failed border-b border-status-failed/20 px-3 py-2 font-mono text-[11px] leading-relaxed">
          {message}
        </div>
      )}
      <div className="font-mono text-[11px]">
        {groups.map((group, gi) => {
          if (group.type === "framework") {
            return (
              <FrameworkGroup
                key={`fw-${gi}`}
                frames={group.frames}
                defaultExpanded={false}
              />
            );
          }
          return <Frame key={`f-${group.index}`} frame={group.frame} />;
        })}
        {groups.length === 0 && (
          <div className="text-muted-foreground px-3 py-2">no stack trace</div>
        )}
      </div>
    </div>
  );
}

function Frame({ frame }: { frame: StackFrame }) {
  const copy = () => {
    navigator.clipboard.writeText(frame.raw).then(
      () => toast.success("frame copied"),
      () => toast.error("copy failed")
    );
  };
  return (
    <div className="group flex items-baseline gap-2 px-3 py-1 hover:bg-status-failed/5">
      <span className="text-muted-foreground shrink-0">at</span>
      {frame.fn && <span className="text-foreground shrink-0">{frame.fn}</span>}
      {frame.file && (
        <span className="text-muted-foreground truncate">
          {frame.file}
          {frame.line != null && `:${frame.line}`}
          {frame.col != null && `:${frame.col}`}
        </span>
      )}
      <button
        type="button"
        onClick={copy}
        aria-label="copy frame"
        className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <CopyIcon className="size-3 text-muted-foreground hover:text-foreground" />
      </button>
    </div>
  );
}

function FrameworkGroup({
  frames,
  defaultExpanded,
}: {
  frames: StackFrame[];
  defaultExpanded: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          "text-muted-foreground hover:text-foreground flex w-full items-center gap-1 px-3 py-1 text-left transition-colors"
        )}
      >
        {expanded ? (
          <ChevronDownIcon className="size-3" />
        ) : (
          <ChevronRightIcon className="size-3" />
        )}
        <span className="font-sans text-[10px] uppercase tracking-wide">
          {frames.length} framework {frames.length === 1 ? "frame" : "frames"}
        </span>
      </button>
      {expanded && frames.map((f, i) => <Frame key={i} frame={f} />)}
    </div>
  );
}
