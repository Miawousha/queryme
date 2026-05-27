---
name: "toudoux"
role: author
visibility: private
description: "App todo Next.js 15 qui fait aussi office de serveur MCP protégé par OAuth, pilotée depuis Claude."
year: 2026
last_active: "2026-04"
language: "TypeScript"
code_bytes: 173495
archived: false
tags: [productivity, mcp, nextjs, typescript]
---

toudoux est une app todo Next.js 15 qui fait aussi office de serveur Model Context Protocol. `src/app/api/mcp/route.ts` enveloppe `mcp-handler` avec une vérification bearer OAuth par requête et enregistre quatre familles d'outils liées à l'utilisateur authentifié : todos (list/add/update/complete/delete), people (un roster avec mentions), recurrences (`add_recurring`, `list_recurring`, `stop_recurring` pilotés par rrule) et stats. Le serveur OAuth2 est codé à la main sous `src/lib/mcp/oauth` avec PKCE, enregistrement dynamique de clients et les routes de découverte `.well-known`, en parallèle de NextAuth v5 avec l'adapter Drizzle sur pg. Banc d'essai quotidien pour MCP — l'app navigateur et le serveur MCP partagent le même schéma Drizzle, et les outils sont ceux qu'Alexandre utilise vraiment depuis Claude.

## What

Deux surfaces sur une seule base Postgres. Dans le navigateur, on se connecte via NextAuth et on tombe sur un dashboard façon Trello allégé pour les todos, les contacts (mentionnables avec `@nom`) et les règles récurrentes exprimées en strings rrule. Dans Claude (ou tout client MCP), on passe l'OAuth une fois via le modal « connect Claude » du dashboard, puis on ajoute/liste/complète des todos, on cherche ou fusionne des personnes, on planifie des récurrences, on tire les stats — tout en parlant à l'agent. Les deux surfaces voient les mêmes données parce qu'elles tapent sur les mêmes tables Drizzle.

## Tech

`src/app/api/mcp/route.ts` parse l'en-tête `Authorization: Bearer` via `resolveUserFromAuthHeader`, renvoie un `401` avec `WWW-Authenticate` pointant sur `/.well-known/oauth-protected-resource` quand il manque, et construit sinon un `mcp-handler` neuf par requête, avec chaque outil enregistré contre le `userId` résolu. L'issuer OAuth2 est codé à la main — `src/lib/mcp/oauth/{issuer,clients,authz,tokens,pkce,crypto}.ts` couvrent la découverte, l'enregistrement dynamique de clients, le flow authorisation code + PKCE et la signature des tokens. Les récurrences utilisent le paquet `rrule`. Drizzle sur `pg` (`src/lib/db/`), tests via Vitest, env validée dans `src/lib/env.ts`.

## Status

Actif tout au long de 2026 — dernier commit 2026-04 (« feat(dashboard): add 'connect Claude' button with MCP setup modal »). ~175 Ko de TypeScript, privé, mono-utilisateur. Utilisé quotidiennement depuis Claude ; le dashboard sert surtout au setup et à une édition manuelle de temps en temps.
