"use client"

import { useEffect, useRef } from "react"

export type ShortcutMap = Record<string, (event: KeyboardEvent) => void>

interface ParsedKey {
  meta: boolean
  shift: boolean
  alt: boolean
  ctrl: boolean
  /** lower-cased key name; "$mod" matches meta on mac, ctrl on win/linux */
  key: string
}

function isMac(): boolean {
  if (typeof navigator === "undefined") return false
  return /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent)
}

function parse(combo: string): ParsedKey {
  const parts = combo.split("+").map((p) => p.trim())
  const out: ParsedKey = { meta: false, shift: false, alt: false, ctrl: false, key: "" }
  for (const p of parts) {
    const lower = p.toLowerCase()
    if (lower === "$mod") {
      if (isMac()) out.meta = true
      else out.ctrl = true
    } else if (lower === "meta" || lower === "cmd") out.meta = true
    else if (lower === "ctrl" || lower === "control") out.ctrl = true
    else if (lower === "shift") out.shift = true
    else if (lower === "alt" || lower === "option") out.alt = true
    else out.key = lower
  }
  return out
}

function matches(parsed: ParsedKey, e: KeyboardEvent): boolean {
  if (parsed.meta !== e.metaKey) return false
  if (parsed.ctrl !== e.ctrlKey) return false
  if (parsed.shift !== e.shiftKey) return false
  if (parsed.alt !== e.altKey) return false
  return e.key.toLowerCase() === parsed.key
}

/**
 * Wires global keyboard shortcuts. Skips when an input/textarea is focused
 * unless the binding includes a modifier (`$mod`, `meta`, `ctrl`) or is `Escape`.
 *
 * Supports a basic `$mod+k` style; sequence chords like `g q` are handled
 * separately via useSequence().
 */
export function useShortcuts(bindings: ShortcutMap) {
  const ref = useRef(bindings)
  ref.current = bindings

  useEffect(() => {
    const parsed = Object.entries(ref.current).map(([combo, handler]) => ({
      parsed: parse(combo),
      handler,
      combo,
    }))

    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName?.toLowerCase()
      const editing =
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        target?.isContentEditable

      for (const { parsed: p, handler } of parsed) {
        const isModBinding = p.meta || p.ctrl || p.alt || p.key === "escape"
        if (editing && !isModBinding) continue
        if (matches(p, e)) {
          e.preventDefault()
          handler(e)
          return
        }
      }
    }

    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])
}

/**
 * Two-key sequence shortcuts ("g q" → go to queues).
 * Window of 1.2s between keys; cancels on any other keypress.
 */
export function useSequence(map: Record<string, () => void>) {
  useEffect(() => {
    let buffer = ""
    let timer: ReturnType<typeof setTimeout> | undefined

    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName?.toLowerCase()
      if (
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        target?.isContentEditable
      )
        return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key.length !== 1) return

      buffer += e.key.toLowerCase()
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => (buffer = ""), 1200)

      for (const seq of Object.keys(map)) {
        if (buffer === seq) {
          map[seq]?.()
          buffer = ""
          if (timer) clearTimeout(timer)
          return
        }
        if (!seq.startsWith(buffer)) {
          // no match starting with current buffer — discard if length matches
        }
      }

      // If nothing in map could possibly start with current buffer, reset.
      if (!Object.keys(map).some((s) => s.startsWith(buffer))) {
        buffer = ""
      }
    }

    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("keydown", onKey)
      if (timer) clearTimeout(timer)
    }
  }, [map])
}
