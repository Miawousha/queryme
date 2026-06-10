"use client";

import type { KbFile } from "@/lib/kb/manifest";
import { useKb } from "@/components/kb/kb-context";
import { humanizeSlug, metaSubtitle, type KbGroup } from "@/lib/kb/meta-format";
import { cn } from "@/lib/utils";

const LABEL = "font-mono text-[10px] uppercase text-[var(--color-text-tertiary)]";
const LABEL_STYLE = { letterSpacing: "0.24em" };

/** Fallback when the manifest fetch hasn't resolved (or an old API omits
 * groups): the resume preset's directories. */
const DEFAULT_GROUPS: KbGroup[] = [
  { name: "experience" },
  { name: "projects" },
  { name: "talks" },
  { name: "recommendations" },
];

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
        "flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left transition-colors",
        cited
          ? "border-[rgba(var(--color-accent-rgb),0.4)] bg-[rgba(var(--color-accent-rgb),0.06)]"
          : "border-[var(--color-border)] hover:border-[var(--color-border-hover)]",
      )}
    >
      {cited && (
        <span
          aria-hidden
          className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-accent)]"
        />
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-1.5">
          <span
            className={cn(
              "truncate text-[13px]",
              cited ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-secondary)]",
            )}
          >
            {file.title}
          </span>
        </span>

        {subtitle && (
          <span className="truncate text-[11px] text-[var(--color-text-tertiary)]">
            {subtitle}
          </span>
        )}
      </span>

      <span
        className="ml-1 shrink-0 self-start font-mono text-[9px] uppercase text-[var(--color-text-tertiary)]"
        style={{ letterSpacing: "0.16em" }}
      >
        {file.type}
      </span>
    </button>
  );
}

/** Section with a header + count. */
function Group({
  label,
  files,
  onOpen,
}: {
  label: string;
  files: KbFile[];
  onOpen: (path: string) => void;
}) {
  if (files.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className={LABEL} style={LABEL_STYLE}>
          {label}
        </span>
        <span className={LABEL} style={LABEL_STYLE}>
          {files.length}
        </span>
      </div>
      {files.map((f) => (
        <FileRow key={f.path} file={f} cited={false} onOpen={onOpen} />
      ))}
    </div>
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
  const { strings, lang, groups: configGroups } = useKb();
  const citedSet = new Set(citedPaths);

  if (manifest.length === 0) {
    return (
      <p className="px-1 text-xs text-[var(--color-text-tertiary)]">{strings.unavailable}</p>
    );
  }

  const groups = configGroups.length > 0 ? configGroups : DEFAULT_GROUPS;
  const known = new Set(groups.map((g) => g.name));

  // Cited files (any directory) come first, in citation order.
  const cited = citedPaths
    .map((p) => manifest.find((f) => f.path === p))
    .filter((f): f is KbFile => f !== undefined);

  // Pinned synthetic entries (e.g. the CV) stay at the very top, outside the
  // directory groups. Identified by a "_virtual/" path prefix.
  const pinned = manifest.filter((f) => f.path.startsWith("_virtual/") && !citedSet.has(f.path));

  // Everything else, grouped by directory.
  const grouped = new Map<string, KbFile[]>();
  for (const g of groups) grouped.set(g.name, []);
  grouped.set("other", []);
  for (const f of manifest) {
    if (citedSet.has(f.path)) continue;
    if (f.path.startsWith("_virtual/")) continue;
    const top = f.path.split("/")[0];
    const key = known.has(top) ? top : "other";
    grouped.get(key)!.push(f);
  }

  const labelOf = (g: KbGroup): string =>
    (lang === "fr" ? g.label?.fr : undefined) ??
    g.label?.en ??
    (strings.sections as Record<string, string | undefined>)[g.name] ??
    humanizeSlug(g.name);

  return (
    <div className="flex flex-col gap-4">
      {pinned.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {pinned.map((f) => (
            <FileRow key={f.path} file={f} cited={false} onOpen={onOpen} />
          ))}
        </div>
      )}

      {cited.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className={LABEL} style={LABEL_STYLE}>
            {strings.referenced}
          </span>
          {cited.map((f) => (
            <FileRow key={f.path} file={f} cited onOpen={onOpen} />
          ))}
        </div>
      )}

      {groups.map((g) => (
        <Group key={g.name} label={labelOf(g)} files={grouped.get(g.name) ?? []} onOpen={onOpen} />
      ))}
      {!groups.some((g) => g.name === "other") && (
        <Group label={strings.sections.other} files={grouped.get("other") ?? []} onOpen={onOpen} />
      )}
    </div>
  );
}
