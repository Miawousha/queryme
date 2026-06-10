"use client";

import { useMemo } from "react";
import { CV_VIRTUAL_PATH, useKb } from "@/components/kb/kb-context";
import { CvPanelView } from "@/components/cv/cv-panel-view";
import { KbTree } from "@/components/kb/kb-tree";
import { KbViewer } from "@/components/kb/kb-viewer";
import { breadcrumbFor, resolveGroups } from "@/lib/kb/tree";
import type { UiLang } from "@/lib/language";

/** Shared top-band style — matches the chat pane's status header height. */
const BAND = "flex h-11 shrink-0 items-center gap-2 border-b border-[var(--color-border)] px-4";

export function KbPanel({ onLangChange }: { onLangChange: (next: UiLang) => void }) {
  const {
    strings,
    lang,
    manifest,
    groups: configGroups,
    citedRefs,
    openTarget,
    openFile,
    closeFile,
  } = useKb();

  const groups = useMemo(
    () =>
      resolveGroups(
        configGroups,
        lang,
        strings.sections as Record<string, string | undefined>,
        strings.sections.other,
      ),
    [configGroups, lang, strings],
  );

  // The synthesized CV doc isn't a real file — render the dedicated view.
  if (openTarget?.path === CV_VIRTUAL_PATH) {
    return (
      <aside className="flex h-full flex-col overflow-hidden">
        <CvPanelView onLangChange={onLangChange} />
      </aside>
    );
  }

  const openFileEntry = openTarget ? manifest.find((f) => f.path === openTarget.path) ?? null : null;

  // When a file is open, the viewer owns the whole pane — including its own
  // top band — so the panel renders nothing else around it.
  if (openFileEntry) {
    return (
      <aside className="flex h-full flex-col overflow-hidden">
        <KbViewer
          file={openFileEntry}
          anchor={openTarget!.anchor}
          citedRefs={citedRefs}
          breadcrumb={breadcrumbFor(openFileEntry.path, groups, strings.sections.other)}
          onBack={closeFile}
        />
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
          {strings.title}
        </span>
        <span className="font-mono text-[10px] uppercase text-[var(--color-text-tertiary)]">
          {manifest.length}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {openTarget ? (
          <p className="text-xs text-[var(--color-text-tertiary)]">{strings.notInKb}</p>
        ) : (
          <KbTree manifest={manifest} citedRefs={citedRefs} onOpen={openFile} />
        )}
      </div>
    </aside>
  );
}
