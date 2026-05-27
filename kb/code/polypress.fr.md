---
name: "polypress"
role: author
visibility: private
description: "Plateforme d'actu pilotée par Polymarket : ingestion cron, scoring de marchés, génération de briefs et rédaction d'articles via Claude + Tavily."
year: 2026
last_active: "2026-03"
language: "TypeScript"
code_bytes: 378819
archived: false
tags: [ai, agent, nextjs, typescript, postgres]
---

polypress est une application Next.js 16 qui transforme l'activité des marchés prédictifs Polymarket en articles d'actualité. Un pipeline piloté par cron Vercel (ingestion toutes les 15 min, tagging, briefs toutes les 2 h, articles deux fois par heure) récupère événements et prix depuis les API Gamma + CLOB de Polymarket dans Drizzle/Postgres, score les marchés, fait générer des briefs par un agent « desk editor », puis un agent « journaliste » rédige des articles adossés à la recherche Tavily — tous les appels passent par Anthropic Claude via le Vercel AI SDK et sont journalisés pour inspection. La console admin expose ingestion, tagging, pipelines, briefs, alertes, logs LLM et un inspecteur de flow construit sur `@xyflow/react`. Projet personnel de journalisme automatisé adossé aux marchés.

## What

Le lecteur voit un fil d'articles cadrés autour de situations du monde réel — politique, économie, conflits, science — chacun ancré sur les prix Polymarket qui ont déclenché l'histoire. En arrière-plan, le système fait tourner quatre jobs cron depuis `vercel.json` : `/api/cron/ingest` toutes les 15 min récupère les événements actifs et les prix, `/api/cron/tag` à xx:07,22,37,52 enrichit les marchés avec theme/region/criticality/sentiment, `/api/cron/briefs` toutes les 2 h demande au desk editor de proposer 5 briefs (single ou roundup, avec priorité et search queries suggérées), et `/api/cron/articles` à xx:15,45 reprend les briefs et écrit les articles. La console admin expose chaque étape — logs d'ingestion, jobs de tag, runs de pipeline, file de briefs, alertes, logs LLM bruts, settings — et un flow inspector `@xyflow/react` rend tout le pipeline en swim-lanes avec settings keys éditables par nœud.

## Tech

Le stockage est Drizzle ORM sur Supabase Postgres (`drizzle.config.ts` + `src/lib/db/schema.ts`) ; le client Polymarket (`src/lib/polymarket/client.ts`) parle à `gamma-api.polymarket.com` pour les événements et `clob.polymarket.com` pour l'historique de prix. La couche LLM (`src/lib/llm/`) utilise `@ai-sdk/anthropic` avec `generateObject` contre des schémas Zod : `storyBriefSchema` (typé `single`/`roundup`, indices de marchés, enum de thème sur 10 catégories, priorité, `researchRequired`, `searchQueries`), `articleOutputSchema` (headline, summary, content, slug, tags sémantiques), `updateDecisionSchema` (faut-il rajouter un paragraphe d'update à un article publié). Tavily (`@tavily/core`) nourrit le journaliste avec jusqu'à 3 requêtes de contexte news quand un brief flagge `researchRequired`. Chaque appel est miroité dans une ligne `llmLogs` (modèle, prompt, output JSON, tokens, durée, statut) reliée à son run de pipeline. Modèles, prompts, nombre max de stories, résultats de recherche et toggles de pause sont tous des settings runtime lus via `getSetting` plutôt qu'hardcodés.

## Status

Projet personnel, privé. Dernière activité 2026-03. Tourne sur Vercel avec cron + Anthropic + Tavily + Supabase câblés en live — génère réellement briefs et articles sur le schedule, pas juste du scaffolding. Pas un produit ; plutôt une expérience de rédaction automatisée.
