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
