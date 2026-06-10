"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
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
  /** The doc (and optional section) shown in the viewer; null = tree. */
  openTarget: KbOpenTarget | null;
  openFile: (path: string, anchor?: string | null) => void;
  closeFile: () => void;
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
      apiBasePath,
      cvPrintBase,
    }),
    [lang, strings, manifestWithCv, groups, citedRefs, openTarget, openFile, closeFile, apiBasePath, cvPrintBase],
  );

  return <KbContext.Provider value={value}>{children}</KbContext.Provider>;
}
