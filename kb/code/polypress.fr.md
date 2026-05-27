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
