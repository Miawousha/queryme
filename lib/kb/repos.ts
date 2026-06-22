// Kept free of node-only imports so it is safe to import from client components.
// The `import type` below is erased at build time, so it must NOT pull
// `lib/kb/loader` (which uses node:fs) into the client bundle.
import type { ProjectEntry } from "./loader";

/** The single public link for a project's CV row. Defensively privacy-safe
 * regardless of caller — it does NOT rely on `withPublicReposOnly` having run,
 * so a private repo url can never become a link:
 *   1. the author's canonical `frontmatter.url`, else
 *   2. the first public, linkable repo's url, else
 *   3. `undefined` — the row renders the name as plain text. */
export function projectLink(p: ProjectEntry): string | undefined {
  if (p.frontmatter.url) return p.frontmatter.url;
  return (p.frontmatter.repos ?? []).find((r) => r.visibility === "public" && r.url)?.url;
}
