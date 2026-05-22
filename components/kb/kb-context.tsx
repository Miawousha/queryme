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

type KbContextValue = {
  /** Every public KB file. Empty until the manifest fetch resolves. */
  manifest: KbFile[];
  /** Ordered KB paths the agent has cited so far this conversation. */
  citedPaths: string[];
  setCitedPaths: (paths: string[]) => void;
  /** The file currently shown in the viewer, or null for the file list. */
  openFilePath: string | null;
  openFile: (path: string) => void;
  closeFile: () => void;
};

const KbContext = createContext<KbContextValue | null>(null);

export function useKb(): KbContextValue {
  const ctx = useContext(KbContext);
  if (!ctx) throw new Error("useKb must be used within <KbProvider>");
  return ctx;
}

export function KbProvider({ children }: { children: ReactNode }) {
  const [manifest, setManifest] = useState<KbFile[]>([]);
  const [citedPaths, setCitedPaths] = useState<string[]>([]);
  const [openFilePath, setOpenFilePath] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/kb")
      .then((r) => (r.ok ? r.json() : { files: [] }))
      .then((data: { files?: KbFile[] }) => {
        if (!cancelled) setManifest(data.files ?? []);
      })
      .catch(() => {
        /* manifest stays empty — the panel shows an empty state */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const openFile = useCallback((path: string) => setOpenFilePath(path), []);
  const closeFile = useCallback(() => setOpenFilePath(null), []);

  const value = useMemo(
    () => ({ manifest, citedPaths, setCitedPaths, openFilePath, openFile, closeFile }),
    [manifest, citedPaths, openFilePath, openFile, closeFile],
  );

  return <KbContext.Provider value={value}>{children}</KbContext.Provider>;
}
