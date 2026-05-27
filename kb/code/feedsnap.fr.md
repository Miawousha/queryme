---
name: "feedsnap"
role: author
visibility: private
description: "Pipeline de feedback auto-hébergeable — widget, CLI et API alimentent un clusteriseur Postgres + pgvector qui produit des tickets priorisés."
year: 2026
last_active: "2026-05"
language: "TypeScript"
code_bytes: 397827
archived: false
tags: [productivity, ai, nextjs, typescript, postgres]
---

feedsnap est un pipeline de feedback auto-hébergeable : un widget intégrable (avec capture d'écran et annotations), une CLI typée et une API versionnée `/api/v1` font remonter le signal humain et agent dans Supabase, où un worker d'embedding et de clustering regroupe les éléments en tickets consommés par un dashboard Next.js et des webhooks sortants. Le worker tourne en deux étapes — embeddings compatibles OpenAI, puis recherche de similarité IVFFlat sur `vector(1536)` pour attribuer les cluster IDs et élire un représentant. Bâti sur Next.js 16, Supabase (auth, RLS, storage pour les screenshots, RPC security-definer), le SDK Anthropic pour le raffinage de tickets, et esbuild pour le bundle widget autonome ; sous licence BSL 1.1 avec bascule en Apache-2.0 en 2029.

## What

Le widget est un IIFE auto-monté : on dépose une balise `<script data-project="..." data-key="...">` sur n'importe quelle page, il accroche un hôte shadow-DOM, monte un bouton flottant, et au clic prend une capture viewport via `html2canvas-pro`, laisse l'utilisateur annoter, puis POST sur `/api/v1/feedback` avec project key, message, blob screenshot et infos soumetteur. La CLI (`@feedsnap/cli`, 14 commandes réparties en lecture, triage, raffinage et admin) pilote la même API depuis agents et humains — `list`, `get`, `search`, `watch` (stream NDJSON de `ticket.created`), `claim`, `comment`, `resolve`, `refine`, plus `project`, `agent-key`, `webhook`, `auth login/whoami`, `submit`. Le dashboard rend les tickets clusterisés avec badges sévérité et priorité, et les webhooks sortants (signés HMAC, queue de retry) poussent les événements vers GitHub Actions, Linear, ou tout outil aval.

## Tech

Le schéma s'étale sur douze migrations numérotées : `app_feedback` avec `embedding vector(1536)` et index IVFFlat (`lists = 100`, ajusté à ~√N au déploiement), `feedback_clusters` avec `representative_id` et `size`, orgs/projets avec RLS basée sur l'appartenance, personal tokens, agent keys, webhooks avec tentatives de livraison, et une RPC `match_cluster` SECURITY DEFINER qui retourne le cluster le plus proche + sa distance. Le worker (`src/worker/`) est un process long-running `tsx` à trois étapes — `dispatch` interroge les lignes en attente, `embed` appelle un endpoint compatible OpenAI, `cluster` lance `match_cluster` avec un seuil de distance cosinus de 0,15 (≈ similarité 0,85) et soit rejoint un cluster existant, soit en crée un nouveau avec `size=1`. Le raffinage (`feedsnap refine <id>`) écrit sévérité, priorité (1–100) et un `refined_payload` structuré (scoring + spec avec titre/summary/repro/acceptance/files) shallow-mergé sur le ticket — explicitement conçu pour qu'un agent Anthropic puisse trier une queue. Le widget se build via bundle IIFE esbuild (`widget/build.mjs`) CSS inliné ; la CLI se build en `tsc` et ship son binaire commander.js en `npm i -g @feedsnap/cli`.

## Status

Pré-1.0 mais la surface `/api/v1` et le schéma sont déclarés stables. Construit par le propriétaire, hébergé en interne ; le grant BSL autorise explicitement l'auto-hébergement pour tout usage interne et bascule en Apache-2.0 le 2029-05-26 (interdiction de service hébergé concurrent jusque-là). Vitest couvre les stages du worker et les commandes CLI ; les docs INTEGRATING / DEPLOYING / CLI_USAGE détaillent l'intégration du widget dans une app Next.js, le déploiement d'une instance, et l'usage CLI en CI.
