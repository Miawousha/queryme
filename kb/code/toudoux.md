---
name: "toudoux"
role: author
visibility: private
description: "Next.js 15 todo app that doubles as an OAuth-protected MCP server, mainly driven from Claude."
year: 2026
last_active: "2026-04"
language: "TypeScript"
code_bytes: 173495
archived: false
tags: [productivity, mcp, nextjs, typescript]
---

toudoux is a Next.js 15 todo app that doubles as a Model Context Protocol server. `src/app/api/mcp/route.ts` wraps `mcp-handler` with a per-request OAuth bearer check and registers four tool families against the authenticated user: todos (list/add/update/complete/delete), people (a roster with mentions), recurrences (rrule-driven `add_recurring`, `list_recurring`, `stop_recurring`), and stats. The OAuth2 server is hand-rolled under `src/lib/mcp/oauth` with PKCE, dynamic client registration, and the `.well-known` discovery routes, alongside NextAuth v5 with the Drizzle adapter on pg. Daily-driver test bed for MCP — the browser app and the MCP server share the same Drizzle schema and the tools are the ones Alexandre actually uses from Claude.
