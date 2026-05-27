---
name: "learn_anything"
url: https://github.com/akhilaryan/learn_anything
role: contributor
visibility: public
description: "OpenWindow — an AI tutor that turns textbooks into interactive multi-subject lessons."
year: 2026
last_active: "2026-05"
language: "TypeScript"
stars: 0
code_bytes: 15680107
archived: false
tags: [education, ai, nextjs, react, typescript]
---

learn_anything is the repo that ships OpenWindow, an AI tutoring product where users photograph textbook pages or pick a subject and the app generates interactive lessons assembled from a library of ~60 React "blocks" — staff notation, chessboard, math plots, piano player, interactive maps, fill-in-blank, drills, and so on. The Lyceum engine routes a topic into a conversation pipeline backed by Anthropic and OpenAI SDKs, persists courses and profiles in Supabase, and gates premium subscriptions through Stripe with a local webhook listener. Owned by Akhil Aryan; I contribute via merged PRs into a large Next.js 16 / React 19 monorepo that also hosts venture-studio operations (CRM, scrapers, simulation harnesses).

## What

A lesson plays as a stream of blocks. The library spans `staff-notation` (music engraving via alphaTab), `chessboard` (with goboard for Go), `math-plot`, `piano-player`, `interactive-keyboard`, `interactive-map` (D3 + Turf for geographic explore), `fraction-visualizer`, `number-line`, `hundred-chart`, `multiplication-table`, `long-division`, `addition-algorithm`, `place-value-blocks`, `bar-model`, `flashcard`, `match-pairs`, `fill-in-blank`, `quick-quiz`, `math-drill`, `data-table`, `breathing-exercise`, `scenario-explore`, `recipe-step`, `timeline`, `video-embed`, `worked-example`, `guitar-tab`, `strumming-pattern`, `rhythm-tap`, `pitch-sing`, `vocal-range-test`, `sing-along`, `sheet-viewer`, `stock-simulator`, `spreadsheet-formula`, and dozens more. The Lyceum engine in `src/lyceum/engine/` orchestrates `flow-controller`, `runner`, `pipeline`, `grading`, `tool-registry`, and `prompts.ts`; markdown prompts (`discover-topics.md`, `extract-questions.md`, `process-textbook.md`, `analyze-transcript.md`, `draft-evaluator.md`, `grading.md`, `fix-jsx.md`) drive each pipeline stage. Routes include `/lyceum`, `/sounding-board`, `/scan` (textbook capture), `/d/[course]`, `/r`, `/s`, plus `/admin` for the operator console.

## Tech

The monorepo is dual-purpose. The app side is Next.js 16 + React 19, Tailwind 4, Supabase SSR (`@supabase/ssr` + `supabase-js`), `@anthropic-ai/sdk` + `@anthropic-ai/claude-agent-sdk` + `@anthropic-ai/claude-code` for agent workflows, `@xyflow/react` for graph UIs, `@monaco-editor/react` for code blocks, `@dnd-kit` for drag-drop, alphaTab and a neutralized-legacy VexFlow shim for music, Three.js (3D), D3 + Turf + topojson for maps, and `@vercel/analytics`. The operations side lives alongside in `simulate/`, `scripts/scrapers/piano-teachers/` (Google Maps, Trinity, RSL, Instagram, YouTube, Playwright-driven verification + CSV export), `agent-lab/`, `admin-simulation/`, with workspace globs targeting `docs/portfolio/accounts/*/engagement/**`. Migrations (40+ files in `supabase/migrations/`) cover courses, profiles, spark reviews, eval sessions, lyceum sessions + journeys + conversations, session attempts, intro JSX, teacher chats, block catalog + enrichments, curriculum library, curator actions, technologies/accessibility, block dimensions, and domains. `npm run dev` runs `next dev` alongside `scripts/stripe-listen.js`, which auto-detects the Stripe CLI and forwards `localhost:3000/api/stripe/webhook`. Build chains `gen:snapshot` (catalog snapshot), `gen:registry` (block registry), and `gen:curriculum` before `next build`.

## Status

Akhil Aryan's product, hosted in his GitHub. I contribute as an outside collaborator through merged PRs — feature work on blocks, the Lyceum engine, scrapers, and infra. The repo is also the venture-studio operations hub for Akhil's portfolio (the workspace pattern under `docs/portfolio/accounts/*/engagement/**` is how each portfolio company's engagement gets its own package). Active development through May 2026; the product targets students using the web app on phone or laptop, with Stripe gating premium tiers.
