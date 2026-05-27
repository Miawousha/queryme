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
