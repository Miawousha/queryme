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
