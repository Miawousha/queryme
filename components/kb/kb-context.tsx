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

/** Reserved manifest path for the synthesized printable CV document. The
 * panel viewer special-cases this path and renders the CV component instead
 * of fetching `/api/kb/file`. */
export const CV_VIRTUAL_PATH = "_virtual/cv";

/** The document + optional section the viewer should show. */
export type KbOpenTarget = { path: string; anchor: string | null };

type KbContextValue = {
  /** Active UI language — used by the CV viewer to fetch the right locale. */
  lang: UiLang;
  /** Localized KB UI strings for the active language. */
  strings: KbStrings;
  /** Every public KB file plus the synthesized CV entry pinned at the top. */
  manifest: KbFile[];
  /** Markdown directory groups in display order (from the content config). */
  groups: KbGroup[];
  /** Ordered (path, anchor) citation pairs from this conversation. */
  citedRefs: CitedRef[];
  setCitedRefs: (refs: CitedRef[]) => void;
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
   * Panel → chat channel, the reverse of `openFile` (chat → panel). The chat
   * pane stores its scroll-to-message function in this ref (mirrors the
   * `seenAutoReveal` exposed-ref pattern: registration never re-renders
   * consumers). Tree chips call `jumpToMessage`, which notifies the jump
   * listeners first (the mobile drawer closes itself so the scroll is
   * visible) and then invokes the registered handler.
   */
  jumpToMessageHandler: RefObject<((messageId: string) => void) | null>;
  /** Ask the chat pane to scroll to (and flash) the citing message. Stable. */
  jumpToMessage: (messageId: string) => void;
  /** Subscribe to jump requests; returns the unsubscribe function. */
  onJumpToMessage: (listener: () => void) => () => void;
  /** Base path for KB API calls (e.g. "/api" or "/api/a/username"). */
  apiBasePath: string;
  /** Account page base for CV links: "" (→ /cv) or "/{username}". */
  cvPrintBase: string;
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
  children,
}: {
  lang: UiLang;
  kbStrings: KbStrings;
  /** Base path for KB API calls. Defaults to "/api". */
  apiBasePath?: string;
  /** Account page base for CV links. Defaults to "" (→ /cv). */
  cvPrintBase?: string;
  children: ReactNode;
}) {
  const strings = kbStrings;
  const [manifest, setManifest] = useState<KbFile[]>([]);
  const [groups, setGroups] = useState<KbGroup[]>([]);
  const [citedRefs, setCitedRefs] = useState<CitedRef[]>([]);
  const [openTarget, setOpenTarget] = useState<KbOpenTarget | null>(null);
  const seenAutoReveal = useRef<Set<string>>(new Set());
  const jumpToMessageHandler = useRef<((messageId: string) => void) | null>(null);
  const jumpListeners = useRef<Set<() => void>>(new Set());

  const onJumpToMessage = useCallback((listener: () => void) => {
    jumpListeners.current.add(listener);
    return () => {
      jumpListeners.current.delete(listener);
    };
  }, []);

  // Listeners run before the handler so the mobile drawer can close in the
  // same click; the scroll itself works regardless (the chat stays mounted
  // and laid out underneath the drawer overlay).
  const jumpToMessage = useCallback((messageId: string) => {
    for (const listener of jumpListeners.current) listener();
    jumpToMessageHandler.current?.(messageId);
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

  // Synthetic CV entry, pinned to the top of the file list. Title flips with
  // language so the entry reads naturally in either locale.
  const manifestWithCv = useMemo<KbFile[]>(() => {
    const cvEntry: KbFile = {
      path: CV_VIRTUAL_PATH,
      title: strings.cv,
      type: "cv",
    };
    return [cvEntry, ...manifest];
  }, [manifest, strings.cv]);

  const value = useMemo(
    () => ({
      lang,
      strings,
      manifest: manifestWithCv,
      groups,
      citedRefs,
      setCitedRefs,
      openTarget,
      openFile,
      closeFile,
      jumpToMessageHandler,
      jumpToMessage,
      onJumpToMessage,
      apiBasePath,
      cvPrintBase,
      seenAutoReveal,
    }),
    [lang, strings, manifestWithCv, groups, citedRefs, openTarget, openFile, closeFile, jumpToMessageHandler, jumpToMessage, onJumpToMessage, apiBasePath, cvPrintBase, seenAutoReveal],
  );

  return <KbContext.Provider value={value}>{children}</KbContext.Provider>;
}
