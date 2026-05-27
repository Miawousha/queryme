---
name: "polypress"
role: author
visibility: private
description: "Pipeline de contenu piloté par cron : ingestion, tagging, génération de briefs et rédaction d'articles via Claude + Tavily."
year: 2026
last_active: "2026-03"
language: "TypeScript"
code_bytes: 378819
archived: false
tags: [ai, agent, nextjs, typescript, postgres]
---

polypress est une application Next.js 16 + Drizzle/Postgres qui orchestre ingestion de contenu, tagging, génération de briefs et rédaction d'articles dans un pipeline déclenché par cron. Elle combine Anthropic Claude (via l'AI SDK), la recherche Tavily et Supabase pour le stockage et l'auth dans une seule boucle agentique. Construit comme outil personnel de veille média et d'écriture.
