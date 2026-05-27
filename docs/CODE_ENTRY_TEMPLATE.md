# `kb/code/<slug>.md` — template & conventions

Each repo under `kb/code/` is one markdown file. The frontmatter holds
machine-readable metrics; the body holds a tight narrative and optional
expanded sections.

## Filename

- `<slug>.md` for the canonical English version
- `<slug>.fr.md` for the French sidecar (optional — loader falls back to EN)
- Slug is lowercase, with hyphens (`battery-digital-twin-models`, not
  `Battery_Digital_Twin_Models`). Doesn't need to match the GitHub repo name
  exactly, but should be stable across renames.

## Frontmatter

```yaml
---
# Required
name: project-name            # display name (can include caps/spaces)
role: author                  # author | maintainer | contributor
visibility: public            # public | private  (default: public)

# Strongly encouraged
description: One-line subtitle shown in lists and CV.
year: 2026                    # main / start year
language: TypeScript          # primary language

# Optional
url: https://github.com/owner/repo   # GitHub URL (rendered as ↗ in panel)
last_active: "2026-05"               # YYYY-MM of last activity
stars: 0                             # GitHub stars at last sync
code_bytes: 173495                   # sum of language bytes (size proxy)
archived: false                      # true if archived on GitHub
stack: [Next.js, Tailwind, Drizzle]  # technologies (optional, narrative)
tags: [ai, agent, mcp, nextjs]       # validated against kb/code/index.yaml
---
```

Validation: any tag not in `kb/code/index.yaml#tags` fails the build.

## Body — opening paragraph

A single, declarative 3–4 sentence paragraph. The pattern:

> **\<Name\>** is a **\<what kind of thing\>** for **\<who or why\>**. Built
> with **\<2–3 key tech choices\>**. **\<One sentence on status, scale, or
> outcome.\>**

### Examples

✅ **Good** (declarative, named, concrete):

> Queryme is the system serving this page. Built with Next.js 15, the Vercel
> AI SDK, Drizzle ORM on Neon Postgres, and a Streamable-HTTP MCP server so
> other agents can query it programmatically. Knowledge base is YAML +
> Markdown, indexed at startup; answers cite their sources back to specific
> KB paths.

❌ **Avoid** (README-style, vague):

> A small Next.js app built on shadcn/ui, radix-ui and lucide-react, with
> next-themes-driven light/dark toggling. A sandbox for experimenting with
> the latest React 19 and Next.js 16 surface and component primitives.

The bad version: starts with "A small…" (descriptive, not declarative),
doesn't name the project, packs the stack list ahead of purpose. Rewrite as:

> Bisque is a sandbox for experimenting with the latest React 19, Next.js
> 16, and shadcn/ui primitives. Built with Tailwind 4 and next-themes for
> light/dark toggling. Personal playground; not deployed.

## Body — optional expanded sections

Add `##` sections when the agent benefits from more context (interview
prep, deep questions, etc.). Order: **What → Tech → Status**.

```markdown
## What
2–4 sentences detailing the problem, approach, or context that didn't
fit in the opener. Stay concrete: what users see, what the system does.

## Tech
Architecture decisions, notable tradeoffs, integrations.

## Status
Timeline, scale, team size, current state, outcomes, lessons.
```

Sections are optional; the opening paragraph alone is enough for most repos.
Add sections only where they pay for themselves.

## Tags

Tags are the cross-cutting dimension that lets the agent and panel filter /
group repos. The canonical list lives in [`kb/code/index.yaml`](../kb/code/index.yaml).

- Adding a tag to one repo: just put it in the frontmatter `tags: [...]`.
- Adding a tag across many repos: fill `assignments:` in `index.yaml` (per-repo
  frontmatter still wins).
- Introducing a new tag value: add it under `tags:` in `index.yaml` with a
  one-line definition, then use it. Unknown tags fail the build.
