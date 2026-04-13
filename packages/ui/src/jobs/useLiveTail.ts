"use client"

import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useBullViewer } from "../context.tsx"

/**
 * Subscribes to the SSE events stream for a queue while `enabled` is true.
 * On every job event, broadcasts a `bv:live-event` window CustomEvent for
 * components to react to + invalidates the relevant TanStack Query keys.
 *
 * Reconnection: exponential backoff 1s → 2s → 4s → 8s → 30s with jitter.
 */
export function useLiveTail(queueName: string, enabled: boolean) {
  const { api } = useBullViewer()
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return

    let es: EventSource | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    let attempt = 0
    let cancelled = false

    const connect = () => {
      if (cancelled) return
      es = new EventSource(api.eventsUrl(queueName))

      es.addEventListener("hello", () => {
        attempt = 0
      })

      es.addEventListener("job", (ev) => {
        try {
          const data = JSON.parse((ev as MessageEvent).data)
          window.dispatchEvent(
            new CustomEvent("bv:live-event", { detail: data }),
          )
          queryClient.invalidateQueries({
            queryKey: ["queues", queueName, "jobs"],
            refetchType: "active",
          })
          queryClient.invalidateQueries({
            queryKey: ["queues"],
            refetchType: "active",
          })
        } catch {
          /* swallow */
        }
      })

      es.addEventListener("error", () => {
        es?.close()
        if (cancelled) return
        attempt = Math.min(attempt + 1, 5)
        const base = Math.min(1000 * 2 ** attempt, 30_000)
        const jitter = Math.random() * 500
        timer = setTimeout(connect, base + jitter)
      })
    }

    connect()

    return () => {
      cancelled = true
      es?.close()
      if (timer) clearTimeout(timer)
    }
  }, [queueName, enabled, api, queryClient])
}
