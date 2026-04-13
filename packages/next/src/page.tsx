import { BullViewerApp } from "@bull-viewer/ui";
import type { BullViewerAppProps } from "@bull-viewer/ui";

/**
 * Server component wrapper that forwards props into `<BullViewerApp>`
 * (which is a `"use client"` component). Because of the server → client
 * boundary, **every prop you pass must be JSON-serializable** — no
 * functions, class instances, Maps, Sets, or Date objects with custom
 * prototypes. In practice the allowed props are:
 *
 *   - `basePath`    (string)
 *   - `apiBase`     (string)
 *   - `viewer`      (plain object: { id, email?, name?, roles? })
 *   - `scopes`      (string[])
 *   - `history`     ("browser" | "memory")
 *
 * Authorization callbacks (`authorize`) are wired separately in the
 * server-only route handler file (`route.ts`), NOT through this page
 * component — Next.js will throw if you try to pass a function across
 * the server/client boundary.
 */
export function QueuesPage(props: BullViewerAppProps) {
  return <BullViewerApp {...props} />;
}
