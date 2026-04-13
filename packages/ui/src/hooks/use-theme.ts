"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

export type Theme = "system" | "dark" | "light";
export type ResolvedTheme = "dark" | "light";

const STORAGE_KEY = "bv:theme";
const listeners = new Set<() => void>();

function readStored(): Theme {
  if (typeof window === "undefined") return "system";
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === "dark" || raw === "light" || raw === "system") return raw;
  return "system";
}

function readResolved(): ResolvedTheme {
  if (typeof window === "undefined") return "dark";
  const stored = readStored();
  if (stored === "dark") return "dark";
  if (stored === "light") return "light";
  // system — bias toward dark when unknown (SRE on-call use case)
  if (window.matchMedia?.("(prefers-color-scheme: light)").matches)
    return "light";
  return "dark";
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const mql = window.matchMedia?.("(prefers-color-scheme: light)");
  const onChange = () => cb();
  mql?.addEventListener?.("change", onChange);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    mql?.removeEventListener?.("change", onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot(): ResolvedTheme {
  return readResolved();
}

function getServerSnapshot(): ResolvedTheme {
  return "dark";
}

export function useTheme() {
  const resolved = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  );
  const stored = useSyncExternalStore(
    subscribe,
    () => readStored(),
    () => "system" as Theme
  );

  const setTheme = useCallback((next: Theme) => {
    if (typeof window === "undefined") return;
    if (next === "system") {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, next);
    }
    listeners.forEach((cb) => cb());
  }, []);

  // Apply class to <html> for convenience in standalone mode.
  // Embedded mode applies it to the bv-root wrapper instead.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.classList.toggle("dark", resolved === "dark");
  }, [resolved]);

  return { theme: stored, resolved, setTheme };
}
