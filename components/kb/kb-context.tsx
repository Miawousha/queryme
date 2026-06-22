"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
  type ReactNode,
} from "react";
import type { KbFile } from "@/lib/kb/manifest";
import type { KbGroup } from "@/lib/kb/meta-format";
import type { KbStrings, UiLang } from "@/lib/language";
import type { CitedRef } from "@/lib/kb/cited-paths";
import type { LatestAnswer } from "@/lib/kb/latest-answer";

/** The document + optional section the viewer should show. */
export type KbOpenTarget = { path: string; anchor: string | null };

type KbContextValue = {
  /** Active UI language — used by the CV viewer to fetch the right locale. */
  lang: UiLang;
  /** Localized KB UI strings for the active language. */
  strings: KbStrings;
  /** Every public KB file in the manifest. */
  manifest: KbFile[];
  /** Markdown directory groups in display order (from the content config). */
  groups: KbGroup[];
  /** Ordered (path, anchor) citation pairs from this conversation. */
  citedRefs: CitedRef[];
  setCitedRefs: (refs: CitedRef[]) => void;
  /** Sources the most recent answer cited; null when none. Drives the strip. */
  latestAnswer: LatestAnswer | null;
  setLatestAnswer: (v: LatestAnswer | null) => void;
  /**
   * Mutable ref whose `.current` Set tracks which citation keys have already
   * triggered an auto-reveal pulse in the tree. Lives in the provider so it
   * survives the tree↔viewer panel swap (which unmounts KbTree). A full page
   * reload resets it together with `citedRefs`, which is correct.
   *
   * Intentionally a ref (not state) — mutations never cause re-renders.
   * Exposed as-is so future callers can pre-populate it (e.g. to suppress
   * re-pulses when seeding history citations on load).
   */
  seenAutoReveal: RefObject<Set<string>>;
  /** The doc (and optional section) shown in the viewer; null = tree. */
  openTarget: KbOpenTarget | null;
  openFile: (path: string, anchor?: string | null) => void;
  closeFile: () => void;
  /**
   * Panel → chat jump channel. All listeners receive the target messageId;
   * both the chat scroll handler and the mobile drawer close subscribe here.
   * The chat pane is always mounted (it owns the conversation), so ordering
   * between listeners doesn't matter — scroll and drawer-close are independent.
   */
  /** Ask the chat pane to scroll to (and flash) the citing message. Stable. */
  jumpToMessage: (messageId: string) => void;
  /**
   * Subscribe to jump requests. The listener receives the target messageId.
   * Returns the unsubscribe function — call it from an effect cleanup.
   */
  onJumpToMessage: (listener: (messageId: string) => void) => () => void;
  /** Base path for KB API calls (e.g. "/api" or "/api/a/username"). */
  apiBasePath: string;
  /** Account page base for CV links: "" (→ /cv) or "/{username}". */
  cvPrintBase: string;
  /**
   * GitHub URL of the active persona content repo (which hosts the KB), or null
   * if none is configured. Used to deep-link a doc to its source on GitHub.
   */
  contentRepoUrl: string | null;
  /** Branch of the active persona content repo, or null if none configured. */
  contentRepoBranch: string | null;
};

const KbContext = createContext<KbContextValue | null>(null);

export function useKb(): KbContextValue {
  const ctx = useContext(KbContext);
  if (!ctx) throw new Error("useKb must be used within <KbProvider>");
  return ctx;
}

export function KbProvider({
  lang,
  kbStrings,
  apiBasePath = "/api",
  cvPrintBase = "",
  contentRepoUrl = null,
  contentRepoBranch = null,
  children,
}: {
  lang: UiLang;
  kbStrings: KbStrings;
  /** Base path for KB API calls. Defaults to "/api". */
  apiBasePath?: string;
  /** Account page base for CV links. Defaults to "" (→ /cv). */
  cvPrintBase?: string;
  /** GitHub URL of the active persona content repo. Defaults to null. */
  contentRepoUrl?: string | null;
  /** Branch of the active persona content repo. Defaults to null. */
  contentRepoBranch?: string | null;
  children: ReactNode;
}) {
  const strings = kbStrings;
  const [manifest, setManifest] = useState<KbFile[]>([]);
  const [groups, setGroups] = useState<KbGroup[]>([]);
  const [citedRefs, setCitedRefs] = useState<CitedRef[]>([]);
  const [latestAnswer, setLatestAnswer] = useState<LatestAnswer | null>(null);
  const [openTarget, setOpenTarget] = useState<KbOpenTarget | null>(null);
  const seenAutoReveal = useRef<Set<string>>(new Set());
  const jumpListeners = useRef<Set<(messageId: string) => void>>(new Set());

  const onJumpToMessage = useCallback((listener: (messageId: string) => void) => {
    jumpListeners.current.add(listener);
    return () => {
      jumpListeners.current.delete(listener);
    };
  }, []);

  const jumpToMessage = useCallback((messageId: string) => {
    for (const listener of jumpListeners.current) listener(messageId);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(`${apiBasePath}/kb?lang=${lang}`)
      .then((r) => (r.ok ? r.json() : { files: [] }))
      .then((data: { files?: KbFile[]; groups?: KbGroup[] }) => {
        if (!cancelled) {
          setManifest(data.files ?? []);
          setGroups(data.groups ?? []);
        }
      })
      .catch(() => {
        /* manifest stays empty — the panel shows an empty state */
      });
    return () => {
      cancelled = true;
    };
  }, [apiBasePath, lang]);

  const openFile = useCallback(
    (path: string, anchor: string | null = null) => setOpenTarget({ path, anchor }),
    [],
  );
  const closeFile = useCallback(() => setOpenTarget(null), []);

  const value = useMemo(
    () => ({
      lang,
      strings,
      manifest,
      groups,
      citedRefs,
      setCitedRefs,
      latestAnswer,
      setLatestAnswer,
      openTarget,
      openFile,
      closeFile,
      jumpToMessage,
      onJumpToMessage,
      apiBasePath,
      cvPrintBase,
      contentRepoUrl,
      contentRepoBranch,
      seenAutoReveal,
    }),
    [lang, strings, manifest, groups, citedRefs, latestAnswer, openTarget, openFile, closeFile, jumpToMessage, onJumpToMessage, apiBasePath, cvPrintBase, contentRepoUrl, contentRepoBranch, seenAutoReveal],
  );

  return <KbContext.Provider value={value}>{children}</KbContext.Provider>;
}
