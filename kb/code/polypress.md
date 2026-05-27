---
name: "polypress"
role: author
visibility: private
description: "Polymarket-driven news platform: cron ingestion, market scoring, brief generation, and article writing via Claude + Tavily."
year: 2026
last_active: "2026-03"
language: "TypeScript"
code_bytes: 378819
archived: false
tags: [ai, agent, nextjs, typescript, postgres]
---

polypress is a Next.js 16 app that turns Polymarket prediction-market activity into news articles. A Vercel-cron-driven pipeline (ingest every 15 min, tag, briefs every 2 h, articles twice an hour) pulls events and prices from Polymarket's Gamma + CLOB APIs into Drizzle/Postgres, scores markets, has a "desk editor" agent generate story briefs, and then a "journalist" agent writes articles grounded in Tavily web search — all calls go through Anthropic Claude via the Vercel AI SDK and are logged for inspection. The admin surface exposes ingestion, tagging, pipelines, briefs, alerts, LLM logs, and a flow inspector built on `@xyflow/react`. Personal project for automated market-aware journalism.

## What

The reader sees a feed of articles framed around real-world situations rather than markets — politics, economics, conflicts, science — each anchored by the Polymarket prices that triggered the story. Behind it, the system runs four cron jobs from `vercel.json`: `/api/cron/ingest` every 15 min pulls active events and prices, `/api/cron/tag` at xx:07,22,37,52 enriches markets with theme/region/criticality/sentiment, `/api/cron/briefs` every 2h asks the desk editor to propose 5 story briefs (single or roundup, with priority and suggested search queries), and `/api/cron/articles` at xx:15,45 picks up briefs and writes the actual articles. The admin console exposes every step — ingestion logs, tag jobs, pipeline runs, brief queue, alerts, raw LLM logs, settings — and a `@xyflow/react` flow inspector renders the whole pipeline as a swim-lane diagram with editable settings keys per node.

## Tech

Storage is Drizzle ORM on Supabase Postgres (`drizzle.config.ts` + `src/lib/db/schema.ts`); the Polymarket client (`src/lib/polymarket/client.ts`) talks to `gamma-api.polymarket.com` for events and `clob.polymarket.com` for price history. The LLM layer (`src/lib/llm/`) uses `@ai-sdk/anthropic` with `generateObject` against Zod schemas: `storyBriefSchema` (typed `single`/`roundup`, market indices, theme enum across 10 categories, priority, `researchRequired`, `searchQueries`), `articleOutputSchema` (headline, summary, content, slug, semantic tags), `updateDecisionSchema` (whether a published article warrants an update paragraph). Tavily (`@tavily/core`) feeds the journalist with up to 3 queries' worth of news context when a brief flags `researchRequired`. Every call is mirrored to an `llmLogs` row (model, prompt, output JSON, tokens, duration, status) and tied to its pipeline run. Models, prompts, max stories, search results, and pause toggles are all runtime settings read by `getSetting` instead of being hardcoded.

## Status

Personal project, private. Last active 2026-03. Runs on Vercel with cron + Anthropic + Tavily + Supabase wired live — actually generating briefs and articles on schedule rather than only scaffolded. Not a product; closer to an automated newsroom experiment.
