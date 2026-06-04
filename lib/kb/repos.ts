import type { Kb } from "./loader";
import type { Repo } from "./schemas";

/** Every repo hosted across all projects, sorted year desc then name. Used by
 * the aggregated "Repositories" view on the CV / KB panel. This module is kept
 * free of node-only imports so it is safe to import from client components
 * (importing it must NOT pull `lib/kb/loader` — which uses node:fs — into the
 * client bundle). */
export function allRepos(kb: Kb): Repo[] {
  return kb.projects
    .flatMap((p) => p.frontmatter.repos ?? [])
    .sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || a.name.localeCompare(b.name));
}
