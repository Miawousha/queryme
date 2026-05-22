"use client";

import { useKb } from "@/components/kb/kb-context";
import { KbFileList } from "@/components/kb/kb-file-list";
import { KbViewer } from "@/components/kb/kb-viewer";

/** Shared top-band style — matches the chat pane's status header height. */
const BAND = "flex h-11 shrink-0 items-center gap-2 border-b border-[var(--color-border)] px-4";

export function KbPanel() {
  const { manifest, citedPaths, openFilePath, openFile, closeFile } = useKb();
  const openFileEntry = openFilePath
    ? manifest.find((f) => f.path === openFilePath) ?? null
    : null;

  // When a file is open, the viewer owns the whole pane — including its own
  // top band — so the panel renders nothing else around it.
  if (openFileEntry) {
    return (
      <aside className="flex h-full flex-col overflow-hidden">
        <KbViewer file={openFileEntry} onBack={closeFile} />
      </aside>
    );
  }

  return (
    <aside className="flex h-full flex-col overflow-hidden">
      <div className={BAND}>
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

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {openFilePath ? (
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
