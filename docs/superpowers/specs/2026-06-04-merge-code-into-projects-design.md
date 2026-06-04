# Merge `code` into `projects` — repos as part of a project

**Date:** 2026-06-04
**Status:** Draft (pending review)

## Problem

The content-repo KB has two sibling categories that overlap conceptually:
`kb/projects/` and `kb/code/`. A GitHub repo *is* a kind of project, so two
folders for "things I built" is confusing for content authors.

They diverged for a real reason — `code/` was built to absorb a **bulk GitHub
import**: a metadata-rich, potentially large repo inventory handled by a tag
registry (`kb/code/index.yaml`), a featured/index split, and an on-demand
`lookup_code_entries` agent tool. `projects/` is a small, hand-curated,
narrative-first set that is always inlined.

We are collapsing this into a single mental model: **a project is the unit, and
a project hosts its repos.**

## Decisions (from brainstorming)

1. **Conceptual model:** repos are *part of* a project, not a sibling category.
2. **Drop bulk import.** No standalone repo inventory; every repo lives under a
   project. The long-tail machinery (featured/index split, `lookup_code_entries`,
   tag registry) is therefore unnecessary and is removed.
3. **Repo shape:** an optional `repos:` array in the project's front-matter. Each
   entry is a metadata object **+ a one-line description** (no per-repo markdown
   body). Reuses today's code fields.
4. **CV / KB side panel:** keep an **aggregated "Repositories" section** gathered
   from every project's `repos`, even though the data nests under projects.
5. **Migration:** **lossless** — every existing repo must end up hosted under a
   project; none are deleted. Migration is **analysis-driven**: read the existing
   repo files, detect natural groupings, propose a set of project definitions,
   and review that first cut **together** before writing anything.
6. **Bulk importer (`scripts/import-github-repos.ts`):** repurpose into a
   **single-repo enrich** helper (URL → ready-to-paste `repos:` YAML block).

## Data model (`lib/kb/schemas.ts`)

New nested `RepoSchema` (repurposed from `RepoFrontmatterSchema`; it is no longer
a file-level front-matter schema):

```ts
export const RepoSchema = z.object({
  name: z.string().min(1),                       // required
  role: z.enum(["author", "maintainer", "contributor"]), // required
  url: z.url().optional(),
  visibility: z.enum(["public", "private"]).default("public"),
  description: z.string().optional(),            // one-line subtitle
  language: z.string().optional(),
  year: z.number().int().min(1900).max(2100).optional(),
  last_active: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  stars: z.number().int().min(0).optional(),
  archived: z.boolean().optional(),
  stack: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),          // free-form; NO registry
});
```

- **Dropped field:** `code_bytes` (a GitHub-API size proxy that is awkward to
  hand-enter and noisy on the CV).
- **Tags are free-form** — the `kb/code/index.yaml` registry is gone, so there is
  no per-tag validation.

`ProjectFrontmatterSchema` gains:

```ts
repos: z.array(RepoSchema).optional(),
```

`RepoFrontmatterSchema` (file-level) is removed.

## Loader (`lib/kb/loader.ts`)

- Stop reading the `kb/code/` directory.
- Remove the `RepoEntry` type and the `code: RepoEntry[]` field from `Kb`.
- Remove the `./code-index` import and the per-repo tag-resolution loop.
- Repos are carried inside `ProjectEntry.frontmatter.repos`.
- Add a helper `allRepos(kb: Kb): Repo[]` that flat-maps every project's repos,
  sorted **year desc, then name** (mirrors the old `code` sort), for the
  aggregated CV / panel views.

## Assembler (`lib/kb/assembler.ts`)

- `renderProjects` lists each project's repos **under that project's heading**, so
  the agent grounds repo facts on the project's existing `[ref: projects/<slug>.md]`.
- Delete `renderRepos`'s standalone `# Code` section, `renderIndexedRepos`, the
  `featuredCodeSlugs` option, and the whole featured/index branch.

## Agent tool + chat UI

- Delete the `lookup_code_entries` tool (`lib/kb/tools.ts`) and **every**
  registration/usage of it (grep `lookup_code` — includes
  `components/chat.tsx:191`, and any MCP/chat tool wiring).

## Curation (`lib/kb/cv-config.ts`)

- Remove the `code` section filter and `chat.featured_code`.
- Keep the `projects` filter (it now implicitly governs each project's repos).

## Cache (`lib/kb/cache.ts`)

- Remove the `getFeaturedCodeSlugs` call and the `featuredCodeSlugs` wiring into
  `assemblePublicKbText`.

## Manifest / KB panel (`lib/kb/manifest.ts`)

- Remove the `relPath.startsWith("code/")` tag-merge, the code-specific fields
  block (`code_bytes`, etc.), and the `loadCodeIndex` import.
- The panel's aggregated "Repositories" view is built from `allRepos(kb)`.

## CV components

- `components/cv/cv-panel-view.tsx` (≈line 173) and
  `components/cv/cv-document.tsx` (≈line 238): replace `kb.code` iteration with
  `allRepos(kb)`; keep the existing i18n section label.

## Deletions

- `lib/kb/code-index.ts` and all support for `kb/code/index.yaml`.

## Scripts

- **`scripts/import-github-repos.ts` → single-repo enrich.** Drop the bulk crawl.
  Given one repo URL (or `owner/name`), fetch via `gh` and print a ready-to-paste
  `repos:` YAML block, reusing `scripts/lib/github-repos.ts`
  (`buildPublicFrontmatter` / `buildPrivateFrontmatter`, minus `code_bytes`).
  Rename the `package.json` script (`import:github` → e.g. `enrich:repo`).
- **New `scripts/migrate-code-to-projects.ts` (codemod).** Operates on a content
  repo's `kb/code/`:
  1. Read every `kb/code/*.md` repo (+ `index.yaml` tags/assignments).
  2. **Analyze** for natural groupings (signals: tags, stack/language, shared name
     prefixes, owner/org, description) and emit a **proposed mapping**
     `project → [repos]` for human review (a "first cut").
  3. On approval, write each repo as a `repos:` entry into its target
     `kb/projects/<slug>.md` (creating project files as needed), then remove the
     migrated `kb/code/` files and `index.yaml`.
  - **Losslessness guarantee:** assert `repos_out == repos_in`; refuse to delete
    any `code/` file whose repo was not written into a project.
- **`scripts/validate-kb.ts`:** drop the `code:` count; report
  `projects: N (R repos)`.

## Citations (intended consequence)

Repo facts now cite their **parent project** (`[^kb:projects/<slug>.md]`). Repos
no longer have their own `code/<slug>.md` citation paths. This is an accepted
consequence of the merge.

## Migration of *this* repo

There is no real `kb/code/` fixture data here (the persona fixture has no
`code/` tree). Migration in-repo is limited to:

- `tests/fixtures/persona/cv-config.yaml` — remove `code:` / `featured_code`.
- `tests/fixtures/persona/prompts/system.md` — remove the
  `lookup_code_entries` / `# Code (index)` references.
- Tests that build code/featured/lookup fixtures inline:
  `tests/lib/kb/{schemas,tools,cv-config,assembler,loader}.test.ts` — rewrite to
  the nested `repos:` model; delete code-index / lookup / featured-split tests;
  add: project-with-`repos` parsing, assembler rendering repos under a project,
  `allRepos` aggregation/sort, updated validate output.

The analysis-driven, lossless migration of **real** repo data targets the user's
separate content repo and is driven by the codemod above; the first-cut project
grouping is reviewed together during execution.

## Docs (`docs/content-repo-guide.md`)

Rewrite: §2 layout (drop `code/` lines; add `repos:` under `projects/`); §6
(replace the `kb/code/` subsection with "Attaching repos to a project"); §8
(remove `code` + `featured_code`); §10 (citations: repos cite their project); §11
(validate output); §14 (remove the unknown-tag troubleshooting row); §15
checklist. Check the README link.

## Testing

- Schema: project with/without `repos`; required `name`/`role`; default
  `visibility`; rejects unknown fields.
- Loader: `repos` parsed; `allRepos` flat-maps + sorts; `code/` no longer read.
- Assembler: repos render under their project; no `# Code*` sections.
- cv-config: no `code`/`featured_code` keys; `projects` filter unaffected.
- Codemod: losslessness (count in == count out); grouping proposal output;
  refuses to drop an unmigrated repo.
- Full `pnpm validate:kb` against the migrated fixtures passes.

## Out of scope

- Per-repo long-form narratives (use the project body).
- Any standalone repo inventory or future bulk import.
- Re-introducing a tag registry.
