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

## What
The repo's payload is the markdown — the Adani BESS engagement overview, the live `tasks.md` list, weekly team-allocation reports, dated archive snapshots, and reference material (Altergo platform overview, SBOM, certification matrix) under `reference/`. Tasks follow a strict rule set: tasks within a section run sequential top-to-bottom, sibling sections run in parallel, same owner in same section cannot overlap, nested sections inherit parent start week unless overridden, `*m` marks certification-matrix milestones. The Svelte viewer turns this into a Gantt + capacity dashboard for weekly syncs.

## Tech
Svelte 4 + TypeScript + Vite, no SvelteKit, no backend — `index.html` + `src/main.ts` mount `App.svelte`. The DSL parser lives in `src/lib/`, produces tasks with computed start/end weeks honoring inheritance and ordering rules, and feeds two views: a Gantt timeline and a per-owner allocation chart. Loads `tasks.md` over `fetch` at dev/preview time or via file-upload fallback. Pure client-side; deploys as static files when needed.

## Status
Active 2026-01 for the ADANI 24-month BESS engagement — drives weekly syncs and certification tracking. Contributor role — Alexandre built the viewer and DSL parser, authors the task list, owns most of the planning markdown. Single-user tool today; team-shareable in browser without infra.
