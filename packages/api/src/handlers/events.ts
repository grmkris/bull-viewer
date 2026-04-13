import { subscribeQueueEvents } from "@bull-viewer/core/server"
import type { RouteHandler } from "../routes.ts"

/**
 * Server-Sent Events stream for a queue's job lifecycle events.
 *
 * Returns a `text/event-stream` Response. The client consumes via
 * standard EventSource (or fetch streams).
 */
export const eventsHandler: RouteHandler = (req, ctx) => {
  const queue = ctx.registry.getQueue(ctx.params.name!)
  if (!queue) {
    return new Response(JSON.stringify({ error: "queue not found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    })
  }

  let unsubscribe: (() => void) | undefined
  let closed = false

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder()
      const send = (data: string, event?: string) => {
        if (closed) return
        try {
          if (event) controller.enqueue(enc.encode(`event: ${event}\n`))
          controller.enqueue(enc.encode(`data: ${data}\n\n`))
        } catch {
          /* controller closed */
        }
      }

      send(JSON.stringify({ type: "hello", queue: ctx.params.name }), "hello")

      const hb = setInterval(() => {
        if (!closed) {
          try {
            controller.enqueue(enc.encode(`:heartbeat\n\n`))
          } catch {
            /* */
          }
        }
      }, 15_000)

      unsubscribe = subscribeQueueEvents(
        ctx.params.name!,
        ctx.registry.connection,
        (event) => {
          send(JSON.stringify(event), "job")
        },
      )

      req.signal?.addEventListener("abort", () => {
        closed = true
        clearInterval(hb)
        unsubscribe?.()
        try {
          controller.close()
        } catch {
          /* already closed */
        }
      })
    },
    cancel() {
      closed = true
      unsubscribe?.()
    },
  })

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
      connection: "keep-alive",
    },
  })
}
