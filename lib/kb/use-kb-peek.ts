"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { KbFile } from "@/lib/kb/manifest";
import type { PeekTarget } from "@/lib/kb/peek-extract";

export const OPEN_DELAY = 400;
export const CLOSE_DELAY = 120;

export type PeekState =
  | { status: "loading" }
  | { status: "ready"; text: string }
  | { status: "error" };

export type PeekActive = { file: KbFile; target: PeekTarget; rect: DOMRect; state: PeekState };

const cache = new Map<string, Promise<string>>();

/** Test-only: drop the module-level doc-text cache. */
export function clearPeekCache() {
  cache.clear();
}

function fetchDocText(apiBasePath: string, path: string, lang: string): Promise<string> {
  const key = `${apiBasePath}|${lang}|${path}`;
  let p = cache.get(key);
  if (!p) {
    p = fetch(`${apiBasePath}/kb/file?path=${encodeURIComponent(path)}&lang=${lang}`)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error("peek load failed"))));
    p.catch(() => cache.delete(key)); // don't cache failures
    cache.set(key, p);
  }
  return p;
}

function coarsePointer(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(hover: none)").matches === true;
}

/** Hover/focus-intent peek controller. Only `md`/`yaml` docs peek; coarse
 * pointers are no-ops (tap-to-open is unchanged). */
export function useKbPeek(apiBasePath: string, lang: string) {
  const [active, setActive] = useState<PeekActive | null>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const token = useRef(0); // guards against a stale fetch resolving after re-show

  const clearTimers = () => {
    if (openTimer.current) clearTimeout(openTimer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    openTimer.current = closeTimer.current = null;
  };

  const hide = useCallback(() => {
    if (openTimer.current) clearTimeout(openTimer.current);
    openTimer.current = null;
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      token.current++;
      setActive(null);
    }, CLOSE_DELAY);
  }, []);

  const show = useCallback(
    (el: HTMLElement, file: KbFile, target: PeekTarget) => {
      if (coarsePointer()) return;
      if (file.type !== "md" && file.type !== "yaml") return;
      clearTimers();
      const rect = el.getBoundingClientRect();
      openTimer.current = setTimeout(() => {
        const mine = ++token.current;
        setActive({ file, target, rect, state: { status: "loading" } });
        fetchDocText(apiBasePath, file.path, lang).then(
          (text) => {
            if (token.current === mine) {
              setActive((a) => (a ? { ...a, state: { status: "ready", text } } : a));
            }
          },
          () => {
            if (token.current === mine) {
              setActive((a) => (a ? { ...a, state: { status: "error" } } : a));
            }
          },
        );
      }, OPEN_DELAY);
    },
    [apiBasePath, lang],
  );

  useEffect(() => clearTimers, []);

  return { active, show, hide };
}
