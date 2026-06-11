"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { KbFile } from "@/lib/kb/manifest";
import { citedRefKey, type CitedRef } from "@/lib/kb/cited-paths";
import { ancestorIdsFor, type KbTreeNode } from "@/lib/kb/tree";
import { anchorMatches } from "@/lib/kb/slug";

function readOverrides(key: string): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.sessionStorage.getItem(key) ?? "{}") as Record<string, boolean>;
  } catch {
    return {};
  }
}

/**
 * Expansion, filter, lens, and citation auto-reveal state for the KB tree.
 * Expansion is an override map (id → open?) on top of the default
 * "collections open, everything else closed". Overrides persist for the
 * session, and an explicit `false` blocks auto-reveal from re-opening a
 * branch the user closed.
 */
export function useKbTreeState({
  storageKey,
  files,
  citedRefs,
  groupNames,
  seenAutoReveal,
}: {
  storageKey: string;
  files: KbFile[];
  citedRefs: CitedRef[];
  groupNames: ReadonlySet<string>;
  /**
   * Ref to the dedup Set tracking which citation keys have already triggered an
   * auto-reveal pulse. Lifted into KbContext so it survives the tree↔viewer
   * panel swap (which unmounts KbTree). Pass `useKb().seenAutoReveal`.
   */
  seenAutoReveal: RefObject<Set<string>>;
}) {
  const [overrides, setOverrides] = useState<Record<string, boolean>>(() =>
    readOverrides(storageKey),
  );
  const [filter, setFilter] = useState("");
  const [lens, setLens] = useState(false);
  const [pulseId, setPulseId] = useState<string | null>(null);
  const pulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persist = useCallback(
    (next: Record<string, boolean>) => {
      setOverrides(next);
      try {
        window.sessionStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* storage unavailable — state stays in memory */
      }
    },
    [storageKey],
  );

  const isExpanded = useCallback(
    (node: KbTreeNode) => overrides[node.id] ?? (node.kind === "collection"),
    [overrides],
  );

  const toggle = useCallback(
    (node: KbTreeNode) => persist({ ...overrides, [node.id]: !isExpanded(node) }),
    [overrides, isExpanded, persist],
  );

  // Auto-reveal: expand the path to a newly cited node once (never re-opening
  // a branch the user closed) and pulse the cited node.
  useEffect(() => {
    const fresh = citedRefs.filter((r) => !seenAutoReveal.current.has(citedRefKey(r.path, r.anchor)));
    if (fresh.length === 0) return;
    for (const r of fresh) seenAutoReveal.current.add(citedRefKey(r.path, r.anchor));

    const next = { ...overrides };
    let changed = false;
    let pulse: string | null = null;
    for (const r of fresh) {
      const file = files.find((f) => f.path === r.path);
      if (!file) continue;
      for (const id of ancestorIdsFor(r.path, groupNames)) {
        if (next[id] === false) continue;
        const defaultOpen = id.startsWith("col:");
        if (next[id] !== true && !defaultOpen) {
          next[id] = true;
          changed = true;
        }
      }
      const section = r.anchor
        ? file.sections?.find((s) => anchorMatches(r.anchor!, s.slug))
        : undefined;
      pulse = section ? `sec:${r.path}#${section.slug}` : `doc:${r.path}`;
    }
    if (changed) persist(next);
    if (pulse !== null) {
      setPulseId(pulse);
      if (pulseTimer.current !== null) clearTimeout(pulseTimer.current);
      pulseTimer.current = setTimeout(() => setPulseId(null), 1600);
    }
  }, [citedRefs, files, groupNames, overrides, persist, seenAutoReveal]);

  // Unmount-only: clear any pending pulse timer.
  useEffect(
    () => () => {
      if (pulseTimer.current !== null) clearTimeout(pulseTimer.current);
    },
    [],
  );

  return { isExpanded, toggle, filter, setFilter, lens, setLens, pulseId };
}
