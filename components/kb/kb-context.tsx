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

/** Reserved manifest path for the synthesized printable CV document. The
 * panel viewer special-cases this path and renders the CV component instead
 * of fetching `/api/kb/file`. */
export const CV_VIRTUAL_PATH = "_virtual/cv";

type KbContextValue = {
  /** Active UI language — used by the CV viewer to fetch the right locale. */
  lang: UiLang;
  /** Localized KB UI strings for the active language. */
  strings: KbStrings;
  /** Every public KB file plus the synthesized CV entry pinned at the top. */
  manifest: KbFile[];
  /** Markdown directory groups in display order (from the content config). */
  groups: KbGroup[];
  /** Ordered KB paths the agent has cited so far this conversation. */
  citedPaths: string[];
  setCitedPaths: (paths: string[]) => void;
  /** The file currently shown in the viewer, or null for the file list. */
  openFilePath: string | null;
  openFile: (path: string) => void;
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
  const [citedPaths, setCitedPaths] = useState<string[]>([]);
  const [openFilePath, setOpenFilePath] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${apiBasePath}/kb`)
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
  }, [apiBasePath]);

  const openFile = useCallback((path: string) => setOpenFilePath(path), []);
  const closeFile = useCallback(() => setOpenFilePath(null), []);

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
      citedPaths,
      setCitedPaths,
      openFilePath,
      openFile,
      closeFile,
      apiBasePath,
      cvPrintBase,
    }),
    [lang, strings, manifestWithCv, groups, citedPaths, openFilePath, openFile, closeFile, apiBasePath, cvPrintBase],
  );

  return <KbContext.Provider value={value}>{children}</KbContext.Provider>;
}
