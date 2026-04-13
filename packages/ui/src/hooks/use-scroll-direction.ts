"use client";

import { useEffect, useState } from "react";

/**
 * Returns "up" or "down" based on the most recent scroll movement, with a
 * small dead zone to prevent flicker. Used by the mobile header to collapse
 * on scroll-down and restore on scroll-up (GitHub mobile pattern).
 */
export function useScrollDirection(deadZone = 8): "up" | "down" {
  const [direction, setDirection] = useState<"up" | "down">("up");

  useEffect(() => {
    if (typeof window === "undefined") return;
    let last = window.scrollY;
    let ticking = false;

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        if (Math.abs(y - last) >= deadZone) {
          setDirection(y > last ? "down" : "up");
          last = y;
        }
        ticking = false;
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [deadZone]);

  return direction;
}
