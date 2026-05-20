# Queryme — Design Spec

**Date:** 2026-05-20
**Owner:** Alexandre Collet
**Status:** Draft — pending implementation plan

## 1. Purpose

A queryable, agent-driven CV. Alexandre publishes a public knowledge base about his professional background and exposes two interfaces over it:

1. A **web chat** for human visitors (HR, recruiters, hiring managers).
2. An **MCP server** for AI agents acting on their behalf (sourcing bots, recruiting assistants).

Both interfaces share one answering function so behavior is identical. The KB, system prompt, and code are fully open-source so any consumer can audit exactly what the agent knows and how it is instructed to behave.

## 2. Goals & non-goals

### Goals
- Save HR people and their agents time when evaluating Alexandre.
- Establish trust through radical transparency (public KB + public system prompt + public code).
- Capture warm inbound leads (who asked what, who's identified themselves).
- Treat human chat and agent MCP as first-class peers from day one.
- Keep architecture simple enough that a reader can hold the whole system in their head.

### Non-goals (v1)
- Voice I/O, file uploads from askers, interview-simulation mode.
- Multi-user / multi-CV (forks welcome, but no SaaS).
- Analytics beyond simple counts.
- Embeddings / vector search (revisit only if KB exceeds ~150K tokens).
- Native mobile app, custom theming per visitor, languages beyond FR/EN.

## 3. Product decisions (locked)

| Decision | Choice |
|---|---|
| Knowledge base structure | Hybrid: structured spine (YAML) + unstructured stories (Markdown with frontmatter) |
| Primary audiences | Human HR via chat AND AI agents via MCP, equal priority from v1 |
| Access control | Public by default; sensitive content (salary, references, private contact) gated behind verified asker identification |
| Lead capture | Yes — identified askers, full transcripts, forwarded-question queue |
| Grounding | Loose: agent may extrapolate reasonable inferences with soft disclaimers; suggests related things it does know when it hits a gap |
| Languages | FR + EN, auto-detected from first user message, toggleable |
| Voice | Third-person narrator ("Alexandre worked at…") |
| Transparency | KB, prompts, and code are all in a single public GitHub repo |
| Retrieval | Single-context: whole KB injected into system prompt with prompt caching. No RAG. |
| Stack | Next.js 15 (App Router) + shadcn/ui + Tailwind, deployed on Vercel |

## 4. Architecture

```
   ┌──────────────────────────────────────────────────┐
   │  GitHub repo (public)                            │
   │  - /kb/profile.yaml      ← structured spine      │
   │  - /kb/experience/*.md   ← jobs + stories        │
   │  - /kb/projects/*.md     ← projects + stories    │
   │  - /kb/skills.yaml       ← skills, ratings       │
   │  - /kb/sensitive/*       ← gated content         │
   │  - /prompts/system.md    ← agent system prompt   │
   └────────────────────┬─────────────────────────────┘
                        │ build time + ISR
                        ▼
   ┌──────────────────────────────────────────────────┐
   │  Next.js app on Vercel                           │
   │                                                  │
   │  /            → marketing + chat (shadcn UI)     │
   │  /api/chat    → AI SDK route, streams answers    │
   │  /api/mcp     → MCP server (Streamable HTTP)     │
   │  /api/identify → asker self-identification       │
   │  /admin       → owner-only conversation review   │
   │                                                  │
   │  KB loader → assembles one cached prompt payload │
   │  Answerer  → shared by /api/chat and /api/mcp    │
   └────────────────────┬─────────────────────────────┘
                        │
                        ▼
   ┌──────────────────────────────────────────────────┐
   │  Vercel Postgres                                 │
   │  - askers (name, company, email, verified_at)   │
   │  - conversations (asker_id, transcript, lang,   │
   │                   channel: chat|mcp)            │
   │  - questions_for_alex (forwarded gaps)          │
   │  + Vercel KV (rate limiting, identification     │
   │               codes, sensitive-content tokens)  │
   └──────────────────────────────────────────────────┘
```

Key invariants:
- **One answerer**: chat and MCP both call the same `answer(question, conversation_state)` function. Gating, citations, language behavior are consistent across channels.
- **KB is files**: only Postgres holds mutable state (askers, transcripts). The KB itself is read-only at runtime; edits go through git.
- **Cached prompt**: the system prompt + public KB chunk is sent with prompt caching on every request. Sensitive chunk is appended only when the asker is verified.

## 5. Knowledge base

### Layout

```
kb/
├── profile.yaml              # name, headline, location, langs, links, photo
├── skills.yaml               # skills with self-rated levels + years
├── experience/
│   ├── 2022-matrice.md       # one file per role
│   └── 2019-acme.md
├── projects/
│   ├── queryme.md            # one file per notable project
│   └── ...
├── education.yaml
├── public-contact.yaml       # email/links happy to share publicly
└── sensitive/                # gated — only served to verified askers
    ├── salary.yaml           # expectations, history
    ├── references.yaml
    └── private-contact.yaml  # phone, personal email
prompts/
├── system.md                 # main agent system prompt (EN + FR)
└── refusal-templates.md      # standardized phrasings for gaps and gating
```

### Per-role / per-project Markdown format

```markdown
---
company: Matrice Technologies
role: Founder / CTO
start: 2022-03
end: present
location: Paris, France
stack: [TypeScript, Next.js, Python, Postgres, Vercel]
tags: [founder, ai, b2b]
---

## What we do
One paragraph in Alexandre's own words.

## Highlights
- Shipped X to Y customers
- Reduced Z by N%

## Stories
### How we landed our first enterprise customer
A few paragraphs of narrative the agent can quote/summarize.
```

### Loading and assembly

- `lib/kb.ts` reads everything, validates with Zod, sorts by date, and produces a single canonical text blob.
- The blob is split into two cache-friendly chunks:
  - **Public** — always sent.
  - **Sensitive** — appended only when the asker is verified for the current conversation.
- The system prompt references sections by name so the agent knows what is open vs. gated and how to respond when content is gated but the asker isn't verified.
- KB changes trigger a Vercel ISR revalidation via a GitHub webhook.

### Why files, not a CMS
- The transparency goal makes the repo the front door.
- Edits = PRs (version history, diff review, easy rollback).
- Zero infra surface for writes.

## 6. Chat interface

**Route:** `/` (also reachable at `/chat`).

**Layout (shadcn + Tailwind):**
- Header: name, role, link to GitHub repo.
- Agent intro message in third person, in detected language.
- Starter chips (e.g., "What's his experience with AI?", "Show me his most recent role", "How do I contact him?").
- Streaming chat transcript (markdown rendered).
- Input box with language toggle.
- Footer transparency links: "view system prompt", "view KB".

**Behavior:**
- Streaming via Vercel AI SDK (`useChat` + `streamText`).
- Language auto-detected from the first user message; toggleable.
- Multi-turn: full transcript sent on each request; KB and system prompt remain in the cached prefix.
- Citations: each factual claim renders a small superscript that deep-links to the KB file/section on GitHub (tooltip with quoted snippet on hover).
- Sensitive-info trigger: when the answerer needs gated content, the assistant message inlines an "Identify yourself to see this" card → opens the identification modal (form → email code entry, both in one modal) → on success, the original question is retried with the sensitive chunk in scope.
- "Ask Alexandre" fallback: when the agent hits a gap, it offers a button to forward the question into `questions_for_alex`.
- Session length cap: 50 turns, configurable, to prevent abuse.
- Sensitive-content unlock is bound to the conversation row and follows the unlock TTL defined in §8.

## 7. MCP server

**Route:** `/api/mcp` — Streamable HTTP transport.

**Discovery:**
- `/.well-known/mcp.json` advertises the endpoint.
- `/mcp` is a human-readable docs page with a copy-pasteable client config snippet.

**Tools:**
- `ask(question, language?, conversation_id?)` — natural-language Q&A. Returns answer with citations. If the question needs gated content, returns `needs_identification` with the schema the caller must POST to `identify`.
- `identify(name, company, work_email, role, conversation_id)` — initiates email verification. Returns a `code_sent` response; the caller submits the code via `verify_identity` (separate tool) to receive a bearer token unlocking sensitive content for the conversation (24h TTL).
- `verify_identity(conversation_id, code)` — completes email verification, returns bearer token.
- `forward_question(question, asker_contact?)` — pushes a question into `questions_for_alex` when the agent can't answer. Public (no identification required) so anonymous agents can still leave a question.

**Resources (read-only, no LLM call):**
- `cv://profile` → `profile.yaml`
- `cv://skills` → `skills.yaml`
- `cv://experience` (list) and `cv://experience/{slug}` (detail)
- `cv://projects` (list) and `cv://projects/{slug}` (detail)
- `cv://education` → `education.yaml`
- `cv://public-contact` → `public-contact.yaml`
- `cv://prompts/system` → the agent's own system prompt (transparency)
- `cv://sensitive/{name}` — requires `Authorization: Bearer <token>` from a successful `verify_identity`.

**Logging:** every MCP call is recorded in the same `conversations` table as chat, with `channel = 'mcp'`.

## 8. Access control, identification, and sensitive content

### Public vs. sensitive split

| Public (no ID needed) | Sensitive (ID required) |
|---|---|
| Bio, headline, location | Salary expectations & history |
| Work history (companies, roles, dates) | References (names + contacts) |
| Skills & ratings | Private contact (phone, personal email) |
| Projects & stories | Anything in `kb/sensitive/` |
| Public contact (work email, LinkedIn, GitHub) | |

The split is determined by file location (anything in `kb/sensitive/` is gated). One rule, easy to audit.

### Identification flow

1. Asker triggers gated content (sensitive question in chat, or sensitive MCP resource/tool).
2. System returns `identification_required` with this schema:
   - `name` (required)
   - `company` (required)
   - `work_email` (required, rejected if domain is a known free-email provider — gmail, outlook, yahoo, proton, icloud, hotmail)
   - `role` (required, free text)
   - `purpose` (optional free text)
3. A 6-digit verification code is sent to `work_email` via Resend.
4. Asker submits the code → session/conversation is upgraded for 24h. Sensitive KB chunk is included in the prompt; the original question is retried.

**Rationale:** unverified forms make lead-capture data worthless and let anyone harvest salary expectations. Email verification is the minimum bar that makes the data trustworthy.

### Rate limiting (Vercel KV)
- Public chat / MCP tools / resources: 60 requests per 10 minutes per IP.
- Identification requests: 5 per hour per IP, 3 per hour per email.

### Sensitive-content unlock TTL
- **Chat:** a `sensitive_unlocked_at` timestamp on the conversation row. Unlock is honored for 24h from that timestamp; after that, asker must re-verify (the same code-entry flow). Closing the tab does not revoke — the conversation can be resumed by the same browser session within 24h.
- **MCP:** bearer token returned from `verify_identity` carries a 24h TTL, scoped to one `conversation_id`. After expiry the agent must re-run `identify` + `verify_identity`.
- One rule, two transports: 24h from verification, scoped to one conversation.

## 9. Admin & lead capture

Owner-only admin view at `/admin`, protected by GitHub OAuth restricted to Alexandre's GitHub account.

- **Conversations** — every transcript, filterable by asker, company, language, channel, and whether sensitive content was unlocked.
- **Askers** — unique identified askers with company, role, last-seen, # conversations.
- **Questions for Alexandre** — the `questions_for_alex` queue. Each entry shows the question, conversation context, asker (if identified), and a "mark as answered" action.
- **Optional weekly digest email** to Alexandre summarizing new askers and forwarded questions.

### Privacy stance (stated on `/privacy`)
- No tracking pixels, no third-party analytics, no fingerprinting beyond IP rate-limiting.
- Asker data is never sold or shared.
- Transcripts and asker records can be deleted on request to a published contact address.

## 10. Data model (Postgres)

```sql
askers (
  id              uuid pk,
  name            text,
  company         text,
  work_email      text unique,
  role            text,
  purpose         text,
  verified_at     timestamptz,
  created_at      timestamptz default now()
);

conversations (
  id                     uuid pk,
  asker_id               uuid null references askers(id),  -- null = anonymous
  channel                text check (channel in ('chat', 'mcp')),
  language               text,                              -- 'en' | 'fr'
  transcript             jsonb,                             -- ordered messages
  sensitive_unlocked_at  timestamptz null,                  -- null = not unlocked; unlock valid for 24h
  started_at             timestamptz default now(),
  last_message_at        timestamptz default now()
);

questions_for_alex (
  id              uuid pk,
  conversation_id uuid references conversations(id),
  asker_id        uuid null references askers(id),
  question        text,
  answered_at     timestamptz null,
  created_at      timestamptz default now()
);

identification_codes (   -- stored in Vercel KV, not Postgres; included here for completeness
  email           text,
  code            text,
  conversation_id uuid,
  expires_at      timestamptz
);
```

## 11. Stack & infrastructure

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 15 (App Router) | |
| UI | shadcn/ui + Tailwind | |
| Hosting | Vercel | Serverless functions for `/api/*` |
| LLM SDK | Vercel AI SDK (`ai` package) | Streaming, tool use |
| LLM provider | Anthropic Claude (default) | Prompt caching maturity; swappable via env var |
| Database | Vercel Postgres (or Neon) | |
| Cache / rate limit | Vercel KV | |
| Email | Resend | Verification codes, optional digest |
| Auth (admin) | GitHub OAuth | Restricted to owner's GitHub user ID |
| KB revalidation | GitHub webhook → ISR revalidate | On push to `main` |
| KB validation | Zod schemas | Validate YAML/frontmatter at build time and dev hot-reload |

## 12. Open items

None of these block starting implementation; they only need to be resolved before deployment.

| # | Item | Default if unresolved |
|---|---|---|
| 1 | Production domain name | Vercel preview domain until set |
| 2 | Public GitHub repo location | Local repo; push to remote when chosen |
| 3 | LLM provider | Anthropic Claude (Sonnet 4.6 default, Haiku 4.5 for cheap paths) |
| 4 | Transactional-email provider for verification codes | Resend |
| 5 | Postgres provider | Vercel Postgres |

## 13. Success criteria for v1

- An HR person can land on the URL, ask a meaningful question in English or French, get a grounded, cited answer, and either ask follow-ups or send Alexandre a question — without creating an account.
- An HR person can request sensitive info, verify their work email, and see the gated content — within the same conversation, in under two minutes.
- An MCP-enabled AI agent can be pointed at the endpoint, call `ask`, and receive the same answers a human would get, including the identification flow when needed.
- A reader of the GitHub repo can find every byte of what the agent knows and is instructed to do, without reading any code.
- Alexandre can review every conversation and unanswered question from `/admin`.
