"use client";

import { useState } from "react";
import type { KbFile } from "@/lib/kb/manifest";
import { useKb } from "@/components/kb/kb-context";
import { metaSubtitle } from "@/lib/kb/meta-format";
import { cn } from "@/lib/utils";

const LABEL = "font-mono text-[10px] uppercase text-[var(--color-text-tertiary)]";
const LABEL_STYLE = { letterSpacing: "0.24em" };

/** Order in which directory groups appear under the "Referenced" section. */
const GROUP_ORDER = ["code", "experience", "projects", "talks", "recommendations", "other"] as const;
type GroupKey = (typeof GROUP_ORDER)[number];

/** Returns the directory group a file belongs to. Files at the kb/ root
 * (profile.yaml, skills.yaml, education.yaml, public-contact.yaml) and any
 * unknown subdirectory fall into "other". */
function groupOf(file: KbFile): GroupKey {
  const top = file.path.split("/")[0];
  if (top === "code" || top === "experience" || top === "projects" || top === "talks" || top === "recommendations") {
    return top;
  }
  return "other";
}

/** Sort within each group. Code rows favour stars desc → year desc → name.
 * Everything else keeps the manifest's path-alphabetical order. */
function sortGroup(files: KbFile[], group: GroupKey): KbFile[] {
  if (group !== "code") return files;
  return [...files].sort((a, b) => {
    const sa = a.meta?.stars ?? 0;
    const sb = b.meta?.stars ?? 0;
    if (sa !== sb) return sb - sa;
    const ya = a.meta?.year ?? 0;
    const yb = b.meta?.year ?? 0;
    if (ya !== yb) return yb - ya;
    return a.title.localeCompare(b.title);
  });
}

function formatBytes(n: number | undefined): string | null {
  if (n === undefined || n <= 0) return null;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function FileRow({
  file,
  cited,
  variant,
  onOpen,
}: {
  file: KbFile;
  cited: boolean;
  variant: "default" | "code";
  onOpen: (path: string) => void;
}) {
  const { strings } = useKb();
  // For code rows, the description (one-line subtitle) replaces the generic
  // role/period subtitle so the panel reads like a project list.
  const subtitle =
    variant === "code" ? file.meta?.description ?? null : metaSubtitle(file.meta);
  const url = file.meta?.url;
  const language = file.meta?.language;
  const isPrivate = file.meta?.visibility === "private";
  const tags = file.meta?.tags;
  const size = variant === "code" ? formatBytes(file.meta?.code_bytes) : null;
  const lastActive = variant === "code" ? file.meta?.last_active : undefined;

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
          {variant === "code" && url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              aria-label={strings.openRepo}
              title={strings.openRepo}
              className="shrink-0 text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-accent)]"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M7 17 17 7M7 7h10v10" />
              </svg>
            </a>
          )}
        </span>

        {subtitle && (
          <span className="truncate text-[11px] text-[var(--color-text-tertiary)]">
            {subtitle}
          </span>
        )}

        {variant === "code" && (language || isPrivate || size || lastActive || (tags && tags.length > 0)) && (
          <span className="mt-0.5 flex flex-wrap items-center gap-1">
            {isPrivate && (
              <span
                className="rounded-full border border-[var(--color-border)] bg-[var(--color-card)]/30 px-1.5 py-px font-mono text-[9px] uppercase text-[var(--color-text-tertiary)]"
                style={{ letterSpacing: "0.16em" }}
              >
                {strings.privateBadge}
              </span>
            )}
            {language && (
              <span
                className="rounded-full border border-[var(--color-border)] px-1.5 py-px font-mono text-[9px] text-[var(--color-text-secondary)]"
              >
                {language}
              </span>
            )}
            {size && (
              <span
                className="rounded-full border border-[var(--color-border)] px-1.5 py-px font-mono text-[9px] text-[var(--color-text-tertiary)]"
              >
                {size}
              </span>
            )}
            {lastActive && (
              <span
                className="font-mono text-[9px] text-[var(--color-text-tertiary)]"
                title={lastActive}
              >
                · {lastActive}
              </span>
            )}
            {tags?.slice(0, 4).map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-[rgba(var(--color-accent-rgb),0.08)] px-1.5 py-px text-[10px] text-[var(--color-text-secondary)]"
              >
                {tag}
              </span>
            ))}
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

/** Section with a header + count + (for `code`) collapsible content. */
function Group({
  label,
  files,
  collapsible,
  onOpen,
}: {
  label: string;
  files: KbFile[];
  collapsible: boolean;
  onOpen: (path: string) => void;
}) {
  const { strings } = useKb();
  const [open, setOpen] = useState(!collapsible);
  if (files.length === 0) return null;

  const header = (
    <div className="flex items-center gap-2">
      <span className={LABEL} style={LABEL_STYLE}>
        {label}
      </span>
      <span className={LABEL} style={LABEL_STYLE}>
        {files.length}
      </span>
    </div>
  );

  return (
    <div className="flex flex-col gap-1.5">
      {collapsible ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? strings.collapseGroup : strings.expandGroup}
          className="flex items-center justify-between gap-2 text-left transition-colors hover:text-[var(--color-text-primary)]"
        >
          {header}
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={cn("text-[var(--color-text-tertiary)] transition-transform", open && "rotate-180")}
            aria-hidden
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      ) : (
        header
      )}
      {open &&
        files.map((f) => (
          <FileRow
            key={f.path}
            file={f}
            cited={false}
            variant={groupOf(f) === "code" ? "code" : "default"}
            onOpen={onOpen}
          />
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
    code: [],
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
  for (const key of GROUP_ORDER) grouped[key] = sortGroup(grouped[key], key);

  return (
    <div className="flex flex-col gap-4">
      {pinned.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {pinned.map((f) => (
            <FileRow key={f.path} file={f} cited={false} variant="default" onOpen={onOpen} />
          ))}
        </div>
      )}

      {cited.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className={LABEL} style={LABEL_STYLE}>
            {strings.referenced}
          </span>
          {cited.map((f) => (
            <FileRow
              key={f.path}
              file={f}
              cited
              variant={groupOf(f) === "code" ? "code" : "default"}
              onOpen={onOpen}
            />
          ))}
        </div>
      )}

      {GROUP_ORDER.map((key) => (
        <Group
          key={key}
          label={strings.sections[key]}
          files={grouped[key]}
          collapsible={key === "code"}
          onOpen={onOpen}
        />
      ))}
    </div>
  );
}
