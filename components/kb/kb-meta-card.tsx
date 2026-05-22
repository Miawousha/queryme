"use client";

import type { KbFileMeta } from "@/lib/kb/manifest";
import { formatPeriod } from "@/lib/kb/meta-format";

const LABEL =
  "font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className={LABEL}>{label}</span>
      <span className="text-[13px] text-[var(--color-text-primary)]">{children}</span>
    </div>
  );
}

function Chips({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="flex flex-col gap-1">
      <span className={LABEL}>{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <span
            key={item}
            className="rounded-full border border-[var(--color-border)] bg-[var(--color-card)] px-2 py-0.5 text-[11px] text-[var(--color-text-secondary)]"
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Renders a KB file's frontmatter as a compact metadata card — shown in the
 * viewer behind the info toggle. Frontmatter is kept out of the document body,
 * so this is the one place a reader sees those fields.
 */
export function KbMetaCard({ meta }: { meta: KbFileMeta }) {
  const period = formatPeriod(meta.start, meta.end);

  return (
    <div className="mb-4 flex flex-col gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)]/40 p-4">
      <div className="grid grid-cols-2 gap-3">
        {meta.company && <Field label="Company">{meta.company}</Field>}
        {meta.role && <Field label="Role">{meta.role}</Field>}
        {period && <Field label="Period">{period}</Field>}
        {meta.location && <Field label="Location">{meta.location}</Field>}
        {meta.year !== undefined && <Field label="Year">{meta.year}</Field>}
        {meta.url && (
          <Field label="Link">
            <a
              href={meta.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--color-accent)] underline-offset-2 hover:underline"
            >
              {meta.url.replace(/^https?:\/\//, "")}
            </a>
          </Field>
        )}
      </div>
      {meta.stack && <Chips label="Stack" items={meta.stack} />}
      {meta.tags && <Chips label="Tags" items={meta.tags} />}
    </div>
  );
}
