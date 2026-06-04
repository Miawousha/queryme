"use client";

import type { KbFile } from "@/lib/kb/manifest";
import { useKb } from "@/components/kb/kb-context";
import { metaSubtitle } from "@/lib/kb/meta-format";
import { cn } from "@/lib/utils";

const LABEL = "font-mono text-[10px] uppercase text-[var(--color-text-tertiary)]";
const LABEL_STYLE = { letterSpacing: "0.24em" };

/** Order in which directory groups appear under the "Referenced" section. */
const GROUP_ORDER = ["experience", "projects", "talks", "recommendations", "other"] as const;
type GroupKey = (typeof GROUP_ORDER)[number];

/** Returns the directory group a file belongs to. Files at the kb/ root
 * (profile.yaml, skills.yaml, education.yaml, public-contact.yaml) and any
 * unknown subdirectory fall into "other". */
function groupOf(file: KbFile): GroupKey {
  const top = file.path.split("/")[0];
  if (top === "experience" || top === "projects" || top === "talks" || top === "recommendations") {
    return top;
  }
  return "other";
}

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
  const { strings } = useKb();
  const citedSet = new Set(citedPaths);

  if (manifest.length === 0) {
    return (
      <p className="px-1 text-xs text-[var(--color-text-tertiary)]">{strings.unavailable}</p>
    );
  }

  // Cited files (any directory) come first, in citation order.
  const cited = citedPaths
    .map((p) => manifest.find((f) => f.path === p))
    .filter((f): f is KbFile => f !== undefined);

  // Pinned synthetic entries (e.g. the CV) stay at the very top, outside the
  // directory groups. Identified by a "_virtual/" path prefix.
  const pinned = manifest.filter((f) => f.path.startsWith("_virtual/") && !citedSet.has(f.path));

  // Everything else, grouped by directory.
  const grouped: Record<GroupKey, KbFile[]> = {
    experience: [],
    projects: [],
    talks: [],
    recommendations: [],
    other: [],
  };
  for (const f of manifest) {
    if (citedSet.has(f.path)) continue;
    if (f.path.startsWith("_virtual/")) continue;
    grouped[groupOf(f)].push(f);
  }

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

      {GROUP_ORDER.map((key) => (
        <Group key={key} label={strings.sections[key]} files={grouped[key]} onOpen={onOpen} />
      ))}
    </div>
  );
}
