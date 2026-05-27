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

## What

The widget is a single self-mounting IIFE: drop a `<script data-project="..." data-key="...">` tag on any page, it appends a shadow-DOM host, mounts a floating button, and on click takes an `html2canvas-pro` screenshot of the current viewport, lets the user annotate, and POSTs to `/api/v1/feedback` with project key, message, screenshot blob, and submitter info. The CLI (`@feedsnap/cli`, 14 commands across read, triage, refine, and admin) drives the same API from agents and humans — `list`, `get`, `search`, `watch` (NDJSON stream of `ticket.created`), `claim`, `comment`, `resolve`, `refine`, plus `project`, `agent-key`, `webhook`, `auth login/whoami`, `submit`. The dashboard renders clustered tickets with severity + priority badges, and outbound webhooks (HMAC-signed, retry queue) push events to GitHub Actions, Linear, or any downstream tool.

## Tech

Schema lives across twelve numbered migrations: `app_feedback` with `embedding vector(1536)` and IVFFlat index (`lists = 100`, tuned to ~√N at deploy time), `feedback_clusters` with `representative_id` + `size`, orgs/projects with membership-based RLS, personal tokens, agent keys, webhooks with delivery attempts, and a `match_cluster` SECURITY DEFINER RPC that returns nearest-cluster + distance. The worker (`src/worker/`) is a `tsx` long-lived process with three stages — `dispatch` polls pending rows, `embed` calls an OpenAI-compatible endpoint, `cluster` runs `match_cluster` with cosine distance threshold 0.15 (≈ similarity 0.85) and either joins an existing cluster or creates a new one with `size=1`. Refinement (`feedsnap refine <id>`) writes severity, priority (1–100), and a structured `refined_payload` (scoring rationale + spec with title/summary/repro/acceptance/files) that's shallow-merged onto the ticket — explicitly designed so an Anthropic-driven agent can triage a queue. Widget builds via esbuild IIFE bundle (`widget/build.mjs`) with CSS inlined; CLI builds via `tsc` and ships its commander.js binary as `npm i -g @feedsnap/cli`.

## Status

Pre-1.0 but the `/api/v1` surface and schema are declared stable. Owner-built, hosted internally; the BSL grant explicitly permits self-hosting for any internal use and converts to Apache-2.0 on 2029-05-26 (no competing hosted service until then). Vitest covers the worker stages and CLI commands; INTEGRATING / DEPLOYING / CLI_USAGE docs walk through embedding the widget on a Next.js app, standing up your own instance, and running the CLI in CI.
