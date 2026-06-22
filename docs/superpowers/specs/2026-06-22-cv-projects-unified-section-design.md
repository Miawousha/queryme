# Unified "Projects" section on the CV

**Date:** 2026-06-22
**Status:** Design approved, pending spec review → implementation plan
**Surfaces:** printable CV (HTML), CV markdown export, public CV JSON, agent-facing KB assembler

## Problem

The CV renders project information in two overlapping blocks, producing duplication:

1. **"Selected projects"** (`components/cv/cv-document.tsx`, ~L329) — sourced from `kb.projects`. Terse one-liner per project: `name · stack · year`, **no description**.
2. **"Open source"** (`cv-document.tsx`, ~L423) — sourced from `allRepos(kb)` (`lib/kb/repos.ts`), which flattens every `repos[]` entry across all projects. Rich per-repo row: `name · role — description`.

A project that has a public repo therefore appears **twice** — once as a terse project line, once as a rich repo line — under two different names (display name vs repo slug). Private projects (ontoloom, graybox) appear only in block 1, with no description. The markdown export (`lib/cv/markdown.ts`) mirrors the same two-block duplication.

The owner wants **one rich entry per project**, listed once, blending open- and closed-source work, each linking to a repo or website when one exists.

## Goals

- Replace blocks 1 + 2 with a single **"Projects"** section: one entry per project file, in `cv-config` order.
- Each entry: `**Name** — description`, with a muted right-aligned `year`. Name links when a public URL exists; plain text otherwise.
- Blend open + closed projects in one list; never leak private repo URLs.
- Keep all CV surfaces consistent: HTML, markdown export, public JSON, and the agent-facing KB assembler.

## Non-goals

- The chat **KB panel** (`components/kb/*`) is a document-tree citation outline, not a repos view — **no change**.
- The "Selected achievements" band (`profile.achievements`) is out of scope.
- No change to which projects are included (owner curates `cv-config.yaml` `projects.include` as today).

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Job-related projects (Altergo platform) | **Keep all, de-dupe** — Altergo platform stays in the list, each project once. |
| Granularity | **One entry per project** (Altergo's 26 repos / dev-tooling's 9 collapse to one row each). |
| Description source | **New project-level `description` field.** |
| Section heading | **"Projects"** ("Projets"). |
| Reach | **All CV surfaces** (HTML + markdown + JSON) + agent KB assembler. KB panel untouched. |
| Per-row meta | **Keep `year`**, drop stack/role chips. |

## Data model

Add an optional one-line description to the project schema (`lib/kb/schemas.ts`, `ProjectFrontmatterSchema`):

```ts
description: z.string().optional(),  // one-line CV subtitle; body stays the narrative
```

The schema is non-strict (unknown keys are stripped, not rejected), so content files can carry `description` before the app ships — it is simply ignored until then.

## Link & description resolution

A single helper resolves the row's link, **defensively privacy-safe regardless of caller** (does not rely on `withPublicReposOnly` having run):

```ts
// lib/kb/repos.ts  (repurpose the now-unused allRepos)
export function projectLink(p: ProjectEntry): string | undefined {
  if (p.frontmatter.url) return p.frontmatter.url;          // author's canonical public link
  return (p.frontmatter.repos ?? [])
    .find((r) => r.visibility === "public" && r.url)?.url;   // first public, linkable repo
  // → undefined when nothing public exists (private project renders name as plain text)
}
```

Privacy invariant preserved: private repo URLs never become links. This composes with the existing `withPublicReposOnly` (`lib/kb/cv-config.ts`), which already strips private repos from the CV-curated `kb`.

Description: `p.frontmatter.description`. If absent, render `name` + `year` only (no dangling separator). Optional fallback: first public repo's `description` — deferred unless backfill leaves gaps.

## Rendering changes (app)

- **`components/cv/cv-document.tsx`**
  - Delete the `allRepos` "Open source" `<section>` (~L423-447) and the `allRepos` import/call.
  - Rewrite the "Selected projects" `<section>` (~L329-363) into the rich list: name (linked via `projectLink`), ` — ` description, right-aligned `year` `MetaMarker`. Reuses existing `cv-entry` / `flex justify-between` markup.
- **`lib/cv/markdown.ts`**: merge the projects loop (L58-66) and the open-source loop (L79-87) into one `## Projects` loop: `- **Name**(link) — description, year`. Drop `allRepos` import.
- **`lib/cv/strings.ts`**: `sections.projects` → "Projects" / "Projets"; remove the now-unused `sections.code` ("Open source") entries (en + fr).
- **`lib/kb/repos.ts`**: replace `allRepos` with `projectLink` (above). Confirm no other consumers (current consumers: only `cv-document.tsx` and `markdown.ts`).
- **`lib/kb/assembler.ts`** (`renderProjects`, L23): include `description` per project for agent grounding consistency. Agent-facing only — low risk.
- **KB panel:** no change.

## Line layout

```
**Queritae** — An agent-driven CV answering questions from a YAML/Markdown KB.     2026
**Ontoloom** — Captures professional knowledge as typed, GitHub-backed artifacts.  2026
**Graybox**  — A local-first meta-ontology modeling organizations as typed data.   2026
```

HTML: `<span><strong><a?>Name</a?></strong> — {description}</span>` on the left, `<MetaMarker>{year}</MetaMarker>` right, matching the existing project row flexbox.

## Content backfill (content repo: queryme-content-alex)

Add `description:` (EN + FR) to each `cv-config`-included project file: `queryme`, `learn-anything`, `ontoloom`, `graybox`, `altergo-battery-intelligence-platform`. Lift from each project's existing primary repo `description` or intro paragraph. Safe to land before the app change (schema is non-strict).

## Implementation split & sequencing

Per the owner's workflow (app/shell changes in a separate dev session; content + pushes in the content repo):

1. **Content session (here):** add `description` to the included project files (EN/FR). Lands first, no-op until the app ships.
2. **App dev session (separate):** schema field, `projectLink` helper, the three render-path edits, strings, assembler alignment, tests.

## Testing

- Unit-test `projectLink`: returns `frontmatter.url`; returns first public repo url; **never returns a private repo url**; returns `undefined` when nothing public.
- Snapshot the new Projects section for a `kb` mixing public-repo, private-repo, and website-only projects.
- Parity: markdown export and public JSON list the same projects/links/descriptions as the HTML; assert no "Open source" / "Selected projects" headings remain.
- Verify the public CV JSON (`/api/a/{username}/cv`) has no consumer depending on a flattened repos/"code" array.
- Print check: the section fits the CV print layout (`components/cv/print.css`).

## Risks

- Removing the per-repo list drops individual visibility of standout public repos (e.g. `battery-digital-twin-models`). Accepted under "one entry per project."
- If a project has neither `url`, a public repo, nor a `description`, the row is just the bold name + year — acceptable, but backfill should avoid it for listed projects.
