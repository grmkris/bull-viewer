/**
 * Shared typed error map used by every procedure.
 *
 * Each entry maps a logical error code to an HTTP status. oRPC wires these
 * into the `errors` argument of every handler that does
 * `.errors(commonErrors)` — so procedures throw structured, typed errors:
 *
 *   .handler(({ errors }) => {
 *     if (!queue) throw errors.QueueMissing({ message: `queue not found: ${name}` })
 *   })
 *
 * Clients see the full error union as typed data and can discriminate on
 * `err.code` (`"QueueMissing"`, `"Forbidden"`, etc.) to render variant
 * toasts or UI states. Previously the API threw raw `ORPCError("NOT_FOUND",
 * ...)` which gave clients only a string message.
 *
 * Keep this small — add a new code only when a procedure actually throws
 * it. Adding an aspirational code to the public type is the same antipattern
 * that bit us with the 19-scope expansion in the review.
 */
export const commonErrors = {
  /** Generic "thing not found" (job id, flow root, etc.). */
  NotFound: {
    status: 404,
    message: "not found",
  },
  /** Queue name not registered in the server's `BULL_VIEWER_QUEUES` list. */
  QueueMissing: {
    status: 404,
    message: "queue not registered",
  },
  /**
   * Viewer's scope set doesn't include the scope required for this procedure.
   * Also used when the handler is read-only and a mutating procedure was
   * called.
   */
  Forbidden: {
    status: 403,
    message: "forbidden",
  },
  /**
   * Handler is in `readOnly: true` mode and the caller attempted a mutation.
   * Distinct from `Forbidden` so the UI can render a different toast
   * ("dashboard is read-only" vs "you don't have permission").
   */
  ReadOnly: {
    status: 403,
    message: "read-only mode",
  },
  /**
   * BullMQ rejected the operation because the job isn't in the right state
   * (e.g. retry on a job that's already `completed`). BullMQ normally throws
   * these as plain strings — the router layer maps them here.
   */
  InvalidState: {
    status: 409,
    message: "invalid job state for this action",
  },
  /** Optional — reserved for future rate-limit middleware. */
  RateLimited: {
    status: 429,
    message: "rate limited",
  },
} as const;

export type CommonErrorCode = keyof typeof commonErrors;
