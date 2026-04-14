/**
 * Tiny structured logger — zero deps, swap for pino later if needed.
 *
 * Emits one line per call like:
 *
 *   2026-04-13T12:34:56.789Z  info  jobs.action ✓ 200 34ms  requestId=abc procedure=jobs.action
 *
 * The `child(fields)` method returns a logger with those fields merged into
 * every subsequent call — used by the API handler to attach `requestId` and
 * `procedure` to every downstream log line automatically.
 *
 * Consumers can swap in a real logger (pino / winston / bunyan) by
 * implementing the `Logger` interface and passing it to
 * `createQueuesApiHandler({ logger })`.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown> | Error): void;
  child(fields: Record<string, unknown>): Logger;
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function envLevel(): LogLevel {
  if (typeof process === "undefined") return "info";
  const raw = process.env?.BULL_VIEWER_LOG_LEVEL?.toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") {
    return raw;
  }
  return "info";
}

function formatFields(fields: Record<string, unknown> | undefined): string {
  if (!fields) return "";
  const parts: string[] = [];
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    const s = typeof v === "string" ? v : JSON.stringify(v);
    parts.push(`${k}=${s}`);
  }
  return parts.length > 0 ? "  " + parts.join(" ") : "";
}

/**
 * Create a console-backed logger. Honors `BULL_VIEWER_LOG_LEVEL` env var.
 * Call `.child({ requestId, procedure })` to merge fields for the lifetime
 * of the request.
 */
export function createConsoleLogger(
  base: Record<string, unknown> = {}
): Logger {
  const minLevel = LEVEL_ORDER[envLevel()];

  const log = (
    level: LogLevel,
    msg: string,
    fields?: Record<string, unknown> | Error
  ) => {
    if (LEVEL_ORDER[level] < minLevel) return;
    const time = new Date().toISOString();
    const label = level.padEnd(5);
    let merged: Record<string, unknown> | undefined;
    if (fields instanceof Error) {
      merged = { ...base, error: fields.message, stack: fields.stack };
    } else if (fields) {
      merged = { ...base, ...fields };
    } else if (Object.keys(base).length > 0) {
      merged = base;
    }
    const line = `${time}  ${label}  ${msg}${formatFields(merged)}`;
    // Route errors and warns to stderr, info+debug to stdout.
    if (level === "error" || level === "warn") {
      console.error(line);
    } else {
      console.log(line);
    }
  };

  return {
    debug: (msg, fields) => log("debug", msg, fields),
    info: (msg, fields) => log("info", msg, fields),
    warn: (msg, fields) => log("warn", msg, fields),
    error: (msg, fields) => log("error", msg, fields),
    child(fields) {
      return createConsoleLogger({ ...base, ...fields });
    },
  };
}

/** Silent logger — useful for tests. */
export const silentLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => silentLogger,
};
