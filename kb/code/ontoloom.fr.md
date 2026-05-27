---
name: "ontoloom"
role: author
visibility: private
description: "Capture du savoir professionnel sous forme d'artefacts typés en markdown GitHub, indexés pour graphe et agents."
year: 2026
last_active: "2026-03"
language: "TypeScript"
code_bytes: 1080329
archived: false
tags: [ai, agent, mcp, nextjs, typescript, postgres]
---

Ontoloom est une application Next.js 16 qui capture le savoir professionnel sous forme d'artefacts typés — compétences, valeurs, préférences — stockés en markdown adossé à GitHub et indexés dans Supabase avec pgvector pour la recherche sémantique. La rédaction est assistée par Anthropic Claude et les embeddings OpenAI ; les lectures sont exposées via un serveur MCP Streamable-HTTP (`mcp-handler` + OAuth) afin que des agents puissent interroger directement le graphe professionnel. Une vue graphe force-directed en React (`react-force-graph-2d`) restitue artefacts et références d'entités ; les workspaces séparent l'état entre contextes personnel et entreprise. Privé, en développement actif.

## What

L'unité de savoir, c'est l'artefact : un document markdown autonome avec frontmatter YAML, de type `skill`, `value` ou `preference`, détenu par une entité (profil, entreprise ou agent) et assignable à plusieurs. L'utilisateur rédige et édite les artefacts dans un éditeur markdown Monaco, téléverse des transcripts de réunion qu'un LLM transforme en brouillons d'artefacts, et explore le réseau d'entités et de références dans un graphe force-directed. Les entreprises ont membres et invitations ; le « workspace actif » décide quels artefacts s'affichent et quelles clés API sont consommées. Les agents externes accèdent aux mêmes données via MCP — lister, lire, chercher par embedding, suivre les références — sans session navigateur.

## Tech

Le stockage est en double écriture : les corps d'artefacts vivent en fichiers `.md` dans un repo GitHub connecté (Octokit + `@octokit/auth-app`), et leurs métadonnées plus un embedding pgvector vivent dans Supabase Postgres (RLS). Le serveur MCP (`src/app/api/[transport]/route.ts`, basé sur `mcp-handler`) accepte deux modes d'auth : Bearer API key (`ol_mcp_*`) et OAuth 2.0 avec PKCE et Dynamic Client Registration — ce dernier pour le connecteur web de Claude.ai, avec routes de découverte `.well-known/oauth-authorization-server` et `oauth-protected-resource`. Chaque appel MCP atterrit dans `mcp_request_logs` (migration `013`). L'abstraction LLM dans `src/lib/llm/` couvre Anthropic (défaut), OpenRouter et OpenAI (embeddings, résumés) ; la résolution des clés cascade agent → entreprise → utilisateur. Les migrations jusqu'à `015` couvrent OAuth, sync de repo, pull support, références d'entités avec policies, identité de membre et colonnes d'IDs d'artefacts.

## Status

Privé et en développement actif au 2026-03, déployé sur Vercel à ontoloom.ai. Le schéma a évolué sur 15 migrations dont un drop de tables obsolètes. L'intégration MCP est câblée de bout en bout avec Claude Desktop, Cursor, Windsurf et Claude.ai documentés ; un bridge `mcp-remote` est proposé pour les clients stdio. Les samples de library (par ex. `samples/novacrm`) sont des packages d'artefacts installables. Pas encore ouvert à des utilisateurs externes.
