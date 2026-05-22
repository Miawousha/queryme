"use client";

import type { KbFile } from "@/lib/kb/manifest";
import { useKb } from "@/components/kb/kb-context";
import { metaSubtitle } from "@/lib/kb/meta-format";
import { cn } from "@/lib/utils";

const LABEL = "font-mono text-[10px] uppercase text-[var(--color-text-tertiary)]";

function FileRow({
  file,
  cited,
  onOpen,
}: {
  file: KbFile;
  cited: boolean;
  onOpen: (path: string) => void;
}) {
  const subtitle = metaSubtitle(file.meta);

  return (
    <button
      type="button"
      onClick={() => onOpen(file.path)}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors",
        cited
          ? "border-[rgba(var(--color-accent-rgb),0.4)] bg-[rgba(var(--color-accent-rgb),0.06)]"
          : "border-[var(--color-border)] hover:border-[var(--color-border-hover)]",
      )}
    >
      {cited && (
        <span
          aria-hidden
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-accent)]"
        />
      )}
      <span className="flex min-w-0 flex-col">
        <span
          className={cn(
            "truncate text-[13px]",
            cited ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-secondary)]",
          )}
        >
          {file.title}
        </span>
        {subtitle && (
          <span className="truncate text-[11px] text-[var(--color-text-tertiary)]">
            {subtitle}
          </span>
        )}
      </span>
      <span
        className="ml-auto shrink-0 self-start font-mono text-[9px] uppercase text-[var(--color-text-tertiary)]"
        style={{ letterSpacing: "0.16em" }}
      >
        {file.type}
      </span>
    </button>
  );
}

export function KbFileList({
  manifest,
  citedPaths,
  onOpen,
}: {
  manifest: KbFile[];
  citedPaths: string[];
  onOpen: (path: string) => void;
}) {
  const { strings } = useKb();
  const citedSet = new Set(citedPaths);
  // Cited files first, in citation order; the rest follow in manifest order.
  const cited = citedPaths
    .map((p) => manifest.find((f) => f.path === p))
    .filter((f): f is KbFile => f !== undefined);
  const rest = manifest.filter((f) => !citedSet.has(f.path));

  if (manifest.length === 0) {
    return (
      <p className="px-1 text-xs text-[var(--color-text-tertiary)]">{strings.unavailable}</p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {cited.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className={LABEL} style={{ letterSpacing: "0.24em" }}>
            {strings.referenced}
          </span>
          {cited.map((f) => (
            <FileRow key={f.path} file={f} cited onOpen={onOpen} />
          ))}
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        {cited.length > 0 && (
          <span className={LABEL} style={{ letterSpacing: "0.24em" }}>
            {strings.allDocuments}
          </span>
        )}
        {rest.map((f) => (
          <FileRow key={f.path} file={f} cited={false} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}
