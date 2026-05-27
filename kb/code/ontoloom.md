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
