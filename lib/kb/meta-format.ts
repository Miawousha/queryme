import type { KbFileMeta } from "@/lib/kb/manifest";

/** Year portion of a "YYYY-MM" / "YYYY-MM-DD" date, or "present" untouched. */
function year(date: string): string {
  return date === "present" ? "present" : date.slice(0, 4);
}

/**
 * Formats a frontmatter date pair into a compact period, e.g. "2009 – 2011"
 * or "2025 – present". Returns null when there is no start date.
 */
export function formatPeriod(start?: string, end?: string): string | null {
  if (!start) return null;
  return end ? `${year(start)} – ${year(end)}` : year(start);
}

/**
 * A one-line subtitle for a KB file row, derived from frontmatter:
 * "role · period" for experience, the year for projects. Null when the
 * frontmatter carries nothing worth showing (e.g. yaml data files).
 */
export function metaSubtitle(meta?: KbFileMeta): string | null {
  if (!meta) return null;
  const period = formatPeriod(meta.start, meta.end);
  if (meta.role) return period ? `${meta.role} · ${period}` : meta.role;
  if (period) return period;
  if (meta.year !== undefined) return String(meta.year);
  return null;
}

/** A directory group of the KB panel, in display order. Derived server-side
 * from the content config's markdown collections. */
export type KbGroup = {
  name: string;
  label?: { en: string; fr?: string };
};

/** Humanizes a kebab/snake slug into a display label ("public-notes" → "Public notes"). */
export function humanizeSlug(slug: string): string {
  const words = slug.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
