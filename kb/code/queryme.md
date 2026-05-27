---
name: queryme
url: https://github.com/Miawousha/queryme
role: author
visibility: public
description: "Agent-driven CV — answers questions about Alexandre from a YAML/Markdown knowledge base."
year: 2026
tags: [ai, agent, mcp, typescript, nextjs]
---

queryme is the system serving this page. Built with Next.js 15, the Vercel AI
SDK, Drizzle ORM on Neon Postgres, and a Streamable-HTTP MCP server so other
agents can ask about Alexandre directly.

## What
The public surface is a chat at `/` (Anthropic-streamed, with citations that
deep-link into a resizable KB side panel), a curated printable CV at `/cv`
filtered by `cv-config.yaml`, an `/about` page, and a password-gated `/admin`
dashboard listing conversations and forwarded questions. Visitors who introduce
themselves trigger an `identify_interviewer` tool whose capture is shown back as
a chip; questions the agent can't answer can be forwarded to Alexandre via an
inline "Ask Alexandre" button, persisted in Postgres, and emailed via Resend.

## Tech
The KB (`/kb/*.yaml`, `/kb/experience/*.md`, `/kb/projects/*.md`,
`/kb/code/*.md`) is validated by Zod schemas in `lib/kb/schemas.ts`, assembled
into one cached text blob at boot (`lib/kb/loader.ts`, `lib/kb/cache.ts`), and
injected into the system prompt with Anthropic prompt caching so every request
after the first is cheap. `lib/answerer.ts` is the single answer path; both
`app/api/chat/route.ts` (Vercel AI SDK streaming) and `app/api/mcp/route.ts`
call it. The MCP route maintains a `sessionId → transport` map over
`WebStandardStreamableHTTPServerTransport`, exposes `ask` and `forward_question`
tools (`lib/mcp/tools.ts`), and rate-limits per IP via Upstash. A golden-question
eval harness under `evals/` runs the live model against `mustCite` /
`mustContain` / `mustNotContain` assertions; build-time `validate-kb.ts` gates
deploys. Self-host path ships a `docker-compose.yml` with TCP-Postgres + Redis
drivers; Vercel prod uses Neon over HTTP and Upstash KV.

## Status
Built 2026, live at queryme.matricetechnologies.com. Sole author; everything in
one public repo by design (no hidden prompt, no hidden KB). 125+ KB files
across experience, projects, talks, recommendations, and code. Used as
Alexandre's primary CV in active recruiter conversations and as the reference
implementation for "agent-as-CV" — most agent questions about Alexandre land
here, so quality of the underlying entries matters more than the UI polish.
