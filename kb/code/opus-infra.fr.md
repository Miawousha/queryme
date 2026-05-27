---
name: "opus-infra"
role: author
visibility: private
description: "Infrastructure d'OPUS — manuscrits comme objets typés au niveau de la claim, avec revue IA et humaine."
year: 2026
last_active: "2026-05"
language: "TypeScript"
code_bytes: 385027
archived: false
tags: [ai, nextjs, typescript, postgres]
---

opus-infra est l'application Next.js 16 + Supabase qui soutient OPUS, une revue scientifique où les manuscrits sont traités comme des objets typés plutôt que des PDF — contenu versionné, extraction de claims (contribution / résultat / méthode / limite avec références d'évidence et de citation), et un workflow de statuts qui fait passer une soumission de brouillon à revue IA par rubrique, appariement de reviewers, revue humaine et consensus, jusqu'à greenlit ou refus. La revue IA et l'extraction de claims appellent toutes deux Claude (`claude-opus-4-7`) via le SDK Anthropic en tool-use ; l'éditeur rend markdown + KaTeX et les diffs de versions. Des tests d'intégration Vitest couvrent articles, revue, revue IA, claims et supervision admin. Privé, à un stade précoce mais déjà substantiellement câblé.

## What

L'unité, c'est la soumission, pas le PDF. L'auteur rédige son manuscrit en markdown + math, le soumet, et l'article entre dans une machine à états explicite : `draft → ai_review → ai_passed → matching → in_human_review → greenlit | declined`. Pendant `ai_review`, le système lance en parallèle deux appels Claude en tool-use — un scorer par rubrique et un extracteur de claims — et expose les deux résultats sur le manuscrit. Les claims sont typés (`contribution`, `result`, `method`, `limitation`), portent des `evidence_refs` (locateurs de section / figure / table / équation) et des `citation_refs` (texte brut + DOI optionnel), et peuvent être `suggested` (IA), `accepted` ou `dismissed` par l'auteur. Les éditeurs apparient ensuite les reviewers humains aux tags du sujet, collectent les revues, et la logique de consensus décide. Il existe une surface publique `/published` et une surface d'oversight admin pour les éditeurs.

## Tech

La revue IA (`src/lib/ai-review/reviewer.ts`) appelle `claude-opus-4-7` via `@anthropic-ai/sdk` avec un unique outil `submit_rubric_review` dont le schéma impose un `summary` plus une entrée par critère (`structure`, `clarity`, `methodology`, `integrity`, chacun avec seuil de passage à 70). L'extracteur de claims (`src/lib/claims/extract.ts`) suit le même pattern avec un outil `submit_claims` dont le JSON Schema énumère les quatre types de claim et les quatre kinds d'evidence ref. Les deux system prompts sont envoyés avec `cache_control: { type: "ephemeral" }` pour profiter du prompt-cache au-delà des retries. Les versions sont stockées en lignes séparées dans `article_versions` et rendues via un pipeline markdown + KaTeX + remark-math, plus `diff` pour les vues entre versions. L'appariement de reviewers (`src/lib/review/matching.ts`) est une intersection de tag-sets lowercase scorée par cardinalité, triée descendante. Les tests d'intégration sous `tests/integration/` (`articles`, `human-review`, `ai-review`, `profiles`, `public-access`, `admin-oversight`) tournent contre un vrai Supabase via `db-helpers.ts`.

## Status

Privé au 2026-05 ; pas encore ouvert aux auteurs. Schéma, workflow de statuts, pipeline IA, modèle de claims, appariement, consensus et surfaces admin sont en place avec couverture d'intégration — substantiellement au-delà du prototype, mais aucune vraie soumission en cours. Deux scripts de seed (`seed:accounts`, `seed:articles`) bootstrappent un environnement dev.
