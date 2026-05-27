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

## What

Two surfaces over one Postgres database. In the browser, you sign in with NextAuth and get a Trello-light dashboard for todos, contacts (mentionable with `@name`), and recurring rules expressed as rrule strings. In Claude (or any MCP client), you go through OAuth once via the `connect Claude` modal on the dashboard, then add/list/complete todos, look up or merge people, schedule recurrences, and pull stats by talking to the agent. Both surfaces see the same data because they hit the same Drizzle tables.

## Tech

`src/app/api/mcp/route.ts` parses the `Authorization: Bearer` header through `resolveUserFromAuthHeader`, returns a `401` with `WWW-Authenticate` pointing at `/.well-known/oauth-protected-resource` when missing, and otherwise constructs a fresh `mcp-handler` per request with each tool registered against that resolved `userId`. The OAuth2 issuer is hand-rolled — `src/lib/mcp/oauth/{issuer,clients,authz,tokens,pkce,crypto}.ts` cover discovery, dynamic client registration, the authorisation code + PKCE flow and token signing. Recurrences use the `rrule` package. Drizzle on `pg` (`src/lib/db/`), tests via Vitest, env validated in `src/lib/env.ts`.

## Status

Active throughout 2026 — last commit 2026-04 ("feat(dashboard): add 'connect Claude' button with MCP setup modal"). ~175 KB of TypeScript, private, single-user. Used daily from Claude; the dashboard mostly exists for setup and the occasional manual edit.
