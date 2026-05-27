---
name: "ontoloom"
role: author
visibility: private
description: "Captures professional knowledge as typed artifacts in GitHub-backed markdown, indexed for graph and agent use."
year: 2026
last_active: "2026-03"
language: "TypeScript"
code_bytes: 1080329
archived: false
tags: [ai, agent, mcp, nextjs, typescript, postgres]
---

Ontoloom is a Next.js 16 app that captures professional knowledge as typed artifacts — skills, values, preferences — stored as GitHub-backed markdown and indexed in Supabase with pgvector for semantic search. Authoring is LLM-assisted via Anthropic Claude and OpenAI embeddings; reads are exposed through a Streamable-HTTP MCP server (`mcp-handler` + OAuth) so agents can query a user's professional graph directly. A force-directed React graph view (`react-force-graph-2d`) renders artifacts and entity references; workspaces scope state across personal and company contexts. Private, in active development.

## What

The unit of knowledge is the artifact: a standalone markdown document with YAML frontmatter, one of three types (`skill`, `value`, `preference`), owned by an entity (profile, company, or agent) and assignable to many. Users author and edit artifacts in a Monaco-backed markdown editor, upload meeting transcripts that an LLM turns into draft artifacts, and explore the resulting web of entities and references in a force-directed graph. Companies have members and invitations; an "active workspace" decides which artifacts show up and which API keys are spent. External agents reach the same data over MCP — list, read, search by embedding, follow references — without needing a browser session.

## Tech

Storage is dual-write: artifact bodies live as `.md` files in a user-connected GitHub repo (Octokit + `@octokit/auth-app`), and their metadata plus a pgvector embedding live in Supabase Postgres (RLS-scoped). The MCP server (`src/app/api/[transport]/route.ts`, built on `mcp-handler`) accepts both API-key Bearer tokens (`ol_mcp_*`) and OAuth 2.0 with PKCE and Dynamic Client Registration — the latter for Claude.ai's web connector, with `.well-known/oauth-authorization-server` and `oauth-protected-resource` discovery routes. Every MCP call lands in `mcp_request_logs` (migration `013`). LLM provider abstraction in `src/lib/llm/` covers Anthropic (default), OpenRouter, and OpenAI (embeddings, summaries); key resolution cascades agent → company → user. Migrations through `015` cover OAuth, repo sync, pull support, entity references with policies, member identity, and per-artifact ID columns.

## Status

Private and in active development as of 2026-03, deployed on Vercel at ontoloom.ai. Schema has churned through 15 migrations including a deprecated-tables drop. The MCP integration is wired end-to-end with Claude Desktop, Cursor, Windsurf and Claude.ai documented; a `mcp-remote` bridge is offered for stdio-only clients. Library samples (e.g. `samples/novacrm`) ship as installable artifact packages. Not yet open to outside users.
