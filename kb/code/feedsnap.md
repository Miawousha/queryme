---
name: "feedsnap"
role: author
visibility: private
description: "Self-hostable feedback pipeline — widget, CLI, and API feed a Postgres + pgvector clusterer that emits prioritized tickets."
year: 2026
last_active: "2026-05"
language: "TypeScript"
code_bytes: 397827
archived: false
tags: [productivity, ai, nextjs, typescript, postgres]
---

feedsnap is a self-hostable feedback pipeline: an embeddable widget (with screenshot + annotations), a typed CLI, and a versioned `/api/v1` ingest API feed user and agent signal into Supabase, where an embedding + clustering worker groups items into tickets that a Next.js dashboard and outbound webhooks consume. The worker runs in two stages — OpenAI-compatible embeddings, then IVFFlat similarity search over `vector(1536)` to assign cluster IDs and elect a representative. Built on Next.js 16, Supabase (auth, RLS, storage for screenshots, security-definer RPCs), Anthropic SDK for ticket refinement, and esbuild for the standalone widget bundle; licensed BSL 1.1 with an Apache-2.0 change date in 2029.
