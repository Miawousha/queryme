/**
 * Shared heading-slug logic. Used by the manifest builder (server), the KB
 * viewer's heading ids (client), and citation-anchor matching — all three
 * must agree, so this is the single home.
 */

/** GitHub-style slug of a heading: lowercase, punctuation stripped, spaces → hyphens. */
export function slugify(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/[\s-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Loose normalization for anchor comparison — the model invents its own
 * kebab-case slugs, so every non-alphanumeric run collapses to one hyphen. */
export function normalizeAnchor(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

/** True when a cited anchor refers to the given section slug. */
export function anchorMatches(anchor: string, slug: string): boolean {
  return normalizeAnchor(anchor) === normalizeAnchor(slug);
}
