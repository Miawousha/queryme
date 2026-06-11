"use client";

import { useSyncExternalStore } from "react";

const SM_QUERY = "(min-width: 640px)";

function subscribe(cb: () => void): () => void {
  const mql = window.matchMedia(SM_QUERY);
  mql.addEventListener("change", cb);
  return () => mql.removeEventListener("change", cb);
}

function getSnapshot(): boolean {
  return window.matchMedia(SM_QUERY).matches;
}

/**
 * Server snapshot is false (narrow / mobile). This means SSR output matches
 * the mobile layout: no desktop pane in the initial HTML. On the client:
 *
 *   - Mobile: stays false → no change, no double-mount. ✓
 *   - Desktop: flips to true on the first client render → pane appears.
 *
 * The trade-off is one repaint where the desktop pane is absent before
 * mounting (acceptable). The alternative — SSR = true — would make mobile
 * SSR render the desktop pane, which is exactly the double-mount we are
 * fixing. useSyncExternalStore handles server/client divergence gracefully
 * (no hydration-mismatch error, unlike useState).
 */
const getServerSnapshot = (): boolean => false;

/**
 * Returns true when the viewport width is >= 640 px (Tailwind's `sm`
 * breakpoint). Built on useSyncExternalStore so it tracks resize events
 * correctly in concurrent-mode React and is SSR-safe.
 */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
