"use client"

import { useCallback, useEffect, useSyncExternalStore } from "react"

export type Density = "compact" | "cozy"

const STORAGE_KEY = "bv:density"
const listeners = new Set<() => void>()

function readStored(): Density {
  if (typeof window === "undefined") return "compact"
  const raw = window.localStorage.getItem(STORAGE_KEY)
  return raw === "cozy" ? "cozy" : "compact"
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) cb()
  }
  window.addEventListener("storage", onStorage)
  return () => {
    listeners.delete(cb)
    window.removeEventListener("storage", onStorage)
  }
}

export function useDensity() {
  const density = useSyncExternalStore(
    subscribe,
    readStored,
    () => "compact" as Density,
  )

  const setDensity = useCallback((next: Density) => {
    if (typeof window === "undefined") return
    window.localStorage.setItem(STORAGE_KEY, next)
    listeners.forEach((cb) => cb())
  }, [])

  const toggleDensity = useCallback(() => {
    setDensity(readStored() === "compact" ? "cozy" : "compact")
  }, [setDensity])

  // Apply data attribute to the .bv-root wrapper via effect
  useEffect(() => {
    if (typeof document === "undefined") return
    const roots = document.querySelectorAll<HTMLElement>(".bv-root")
    roots.forEach((el) => el.setAttribute("data-density", density))
  }, [density])

  return { density, setDensity, toggleDensity }
}
