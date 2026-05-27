---
name: "opus-infra"
role: author
visibility: private
description: "Backing infra for OPUS — manuscripts as typed, claim-level objects with AI + human peer review."
year: 2026
last_active: "2026-05"
language: "TypeScript"
code_bytes: 385027
archived: false
tags: [ai, nextjs, typescript, postgres]
---

opus-infra is the Next.js 16 + Supabase application backing OPUS, a scientific journal that treats manuscripts as typed objects rather than PDFs — versioned content, claim extraction (contribution / result / method / limitation with evidence and citation refs), and a status workflow that moves a submission from draft through AI rubric review, reviewer matching, human review and consensus, to greenlit or declined. AI review and claim extraction both call Claude (`claude-opus-4-7`) via the Anthropic SDK with tool-use; the editor renders markdown + KaTeX and version diffs. Vitest integration tests cover the article, review, AI-review, claims, and admin oversight surfaces. Private, early but substantively wired beyond a stub.

## What

The submission is the unit, not the PDF. An author writes the manuscript as markdown + math, hits submit, and the article enters an explicit status machine: `draft → ai_review → ai_passed → matching → in_human_review → greenlit | declined`. During `ai_review` the system runs two Claude tool-use calls in parallel — a rubric scorer and a claim extractor — and shows both results on the manuscript. Claims are typed (`contribution`, `result`, `method`, `limitation`), carry `evidence_refs` (section / figure / table / equation locators) and `citation_refs` (raw text + optional DOI), and can be `suggested` (AI), `accepted`, or `dismissed` by the author. Editors then match human reviewers to topic tags, collect reviews, and the consensus logic decides the outcome. There's a public `/published` surface and an admin oversight surface for editors.

## Tech

The AI review (`src/lib/ai-review/reviewer.ts`) calls `claude-opus-4-7` via `@anthropic-ai/sdk` with a single `submit_rubric_review` tool whose schema enforces a `summary` plus one entry per rubric criterion (`structure`, `clarity`, `methodology`, `integrity`, each with a 70-point pass threshold). The claim extractor (`src/lib/claims/extract.ts`) uses the same pattern with a `submit_claims` tool whose JSON Schema enumerates the four claim types and the four evidence-ref kinds. Both system prompts are sent with `cache_control: { type: "ephemeral" }` for prompt-cache hits across retries. Versions are stored as separate rows in `article_versions` and rendered with a markdown + KaTeX + remark-math pipeline plus `diff` for version-to-version views. Reviewer matching (`src/lib/review/matching.ts`) is a simple lowercase tag-set intersection scored by count, sorted descending. Integration tests under `tests/integration/` (`articles`, `human-review`, `ai-review`, `profiles`, `public-access`, `admin-oversight`) run against a real Supabase via `db-helpers.ts`.

## Status

Private as of 2026-05; not yet open to authors. Schema, status workflow, AI pipeline, claims model, reviewer matching, consensus, and admin surfaces are all in place with integration coverage — substantively past a prototype, but no real submissions in flight. Two seed scripts (`seed:accounts`, `seed:articles`) bootstrap a dev environment.
