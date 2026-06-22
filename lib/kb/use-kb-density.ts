"use client";

import { useCallback, useEffect, useState } from "react";

export type KbDensity = "compact" | "comfortable";

const KEY = "queritae:kbDensity";

/** KB tree row density, persisted globally (like the panel width). Defaults to
 * `compact` (today's spacing) so there is no regression in the default state. */
export function useKbDensity(): [KbDensity, () => void] {
  const [density, setDensity] = useState<KbDensity>("compact");

  // Rehydrate after mount (SSR-safe: server always renders compact).
  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) === "comfortable") setDensity("comfortable");
    } catch {
      /* storage unavailable */
    }
  }, []);

  const toggle = useCallback(() => {
    setDensity((d) => {
      const next: KbDensity = d === "compact" ? "comfortable" : "compact";
      try {
        localStorage.setItem(KEY, next);
      } catch {
        /* storage unavailable — state stays in memory */
      }
      return next;
    });
  }, []);

  return [density, toggle];
}
