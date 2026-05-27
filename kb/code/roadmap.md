---
name: "roadmap"
url: https://github.com/ION-Altergo/roadmap
role: contributor
visibility: private
description: "Internal roadmap workspace — markdown task DSL plus a Svelte Gantt/team viewer."
year: 2026
last_active: "2026-01"
language: "Svelte"
code_bytes: 68864
archived: false
tags: [svelte, productivity, docs]
---

roadmap is ION-Altergo's internal product-planning workspace, mostly markdown (`Adani/overview.md`, `Adani/tasks.md`, archived snapshots, reference SBOM/certification docs) driven by a small Svelte 4 + Vite viewer under `Adani/viewer/`. The viewer parses a custom task DSL (`++X` effort, `~X` lead time, `@W` week anchor, owner suffix) into a Gantt chart and a per-owner team-allocation view; it fetches `tasks.md` at runtime or accepts a file upload. Functional in-browser tool, no backend; not a SvelteKit app.
