"use client";

import { useKb } from "@/components/kb/kb-context";
import { KbFileList } from "@/components/kb/kb-file-list";
import { KbViewer } from "@/components/kb/kb-viewer";

export function KbPanel() {
  const { manifest, citedPaths, openFilePath, openFile, closeFile } = useKb();
  const openFileEntry = openFilePath
    ? manifest.find((f) => f.path === openFilePath) ?? null
    : null;

  return (
    <aside className="flex h-full flex-col gap-3 overflow-hidden">
      <div className="flex items-baseline gap-2 border-b border-[var(--color-border)] pb-2">
        <span
          className="font-mono text-[10px] uppercase text-[var(--color-primary)]"
          style={{ letterSpacing: "0.32em" }}
        >
          knowledge base
        </span>
        <span className="font-mono text-[10px] uppercase text-[var(--color-text-tertiary)]">
          {manifest.length}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {openFileEntry ? (
          <KbViewer file={openFileEntry} onBack={closeFile} />
        ) : openFilePath ? (
          <p className="text-xs text-[var(--color-text-tertiary)]">
            That document isn&apos;t in the knowledge base.
          </p>
        ) : (
          <KbFileList manifest={manifest} citedPaths={citedPaths} onOpen={openFile} />
        )}
      </div>
    </aside>
  );
}
