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
