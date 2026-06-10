# Queritae

A queryable CV. Each account's knowledge base, system prompt, and persona config live in that account's own GitHub content repo — this app is a content-free shell that syncs and serves them. Nothing hidden, nothing puffed up.

Live: _coming soon_

## How it works

1. Each account links a GitHub content repo (see [docs/content-repo-guide.md](docs/content-repo-guide.md)). Its `kb/` holds YAML files (structured facts) and Markdown files (narrative stories) — one file per role and per project; its `prompts/system.md` is the agent's system prompt, plain Markdown.
2. The app syncs the content repo on demand (admin → Content tab), pins it to a commit, and caches it per account.
3. At request time the app loads the KB, assembles it into a single text blob, and injects it into the system prompt with Anthropic prompt caching so every request after the first is cheap. Each project lists the repos that back it under a `### Repositories` subheading — see [docs/agent-context.md](docs/agent-context.md) for the full walkthrough.
4. The web chat at `/{username}` calls `/api/a/{username}/chat`, which calls a shared `answer()` function. The MCP server at `/api/mcp` calls the same `answer()` — see [MCP server](#mcp-server) below.

The agent can also recognize who it is talking to: when a visitor introduces
themselves (e.g. a recruiter naming their company and the role they're
hiring for), the agent calls an `identify_interviewer` tool that records that
on the conversation. Nothing is hidden — the tool, its code, and the prompt
instructions are all in this repo, and the chat shows a chip with exactly what
was captured.

### Knowledge-base panel

Alongside the chat, a side panel lists every file in the public knowledge base.
As the agent cites sources, those files are surfaced to the top of the list and
highlighted; clicking a citation in an answer opens that file in an in-app
viewer (markdown, YAML, HTML, and PDF are supported). The panel is resizable and
collapsible, and becomes a drawer on small screens.

## Local development

Prereqs: Node 20+, pnpm, an Anthropic API key.

```bash
pnpm install
cp .env.example .env.local
# Edit .env.local and set ANTHROPIC_API_KEY
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Provisioning (one time)

Persistence needs Postgres (via Vercel/Neon) and Upstash Redis (via Vercel KV).

1. Vercel dashboard → Storage → Create Database → Neon. Connect to the project.
2. Vercel dashboard → Storage → Create Database → KV. Connect to the project.
3. Pull all envs locally: `vercel env pull .env.local`
4. Run migrations: `pnpm db:migrate`

After this, `pnpm dev` will work end-to-end.

## Multi-tenant accounts

The app serves a "house" account at the bare domain `/` and additional accounts at `/{username}`. Set `ROOT_ACCOUNT_USERNAME` in your environment to the GitHub username of the house account.

### First-time / deploy setup

```bash
pnpm db:migrate                                         # create tables
pnpm admin account create <ROOT_ACCOUNT_USERNAME>       # create the house account
pnpm backfill:root                                      # associate pre-existing rows with the house account
pnpm admin account link <ROOT_ACCOUNT_USERNAME> <public-github-repo-url>  # point it at a content repo
```

`pnpm backfill:root` is idempotent — it only touches rows whose `account_id` is NULL (rows created before multi-tenancy). Re-running it after a partial run is safe.

### Adding another account

```bash
pnpm admin account create <username>
pnpm admin account link <username> <public-github-repo-url>
```

CLI-created accounts are active immediately at `/{username}` — creating one is
a deliberate operator action.

### Signups, the waitlist, and the kill switch

Self-serve GitHub signups start **waitlisted**: the account exists and its
owner can prepare content from `/{username}/admin`, but every public surface
(persona page, chat, KB, CV, forward) 404s and no paid model call can be
reached until a super-admin approves it — from the `/admin` console or the
CLI:

```bash
pnpm admin account approve <username>    # waitlisted → active
pnpm admin account disable <username>    # kill switch (any status → disabled)
pnpm admin account waitlist <username>   # back to pending
```

### Quotas and spend alerting

Every chat / MCP answer is metered per account per UTC day (messages +
tokens, `account_usage` table). Requests beyond the per-account caps —
`QUOTA_DAILY_MESSAGES_PER_ACCOUNT` (default 200) and
`QUOTA_MONTHLY_TOKENS_PER_ACCOUNT` (default 10M) — get a 429 before the
Anthropic call. A daily Vercel cron (`/api/cron/usage-alert`, guarded by
`CRON_SECRET`) emails a digest when platform-wide daily tokens cross
`USAGE_ALERT_DAILY_TOKENS`.

### Not yet implemented (future plans)

- Per-account MCP endpoints (`/api/mcp` serves the house account only)
- `account_id` NOT NULL hardening — the MCP `ask` path creates conversations without an account, so a NOT NULL constraint would be a runtime landmine until that path is threaded through account resolution

## Sign in / accounts

Visitors sign in with GitHub. The first time someone authenticates, queritae
auto-provisions an account for them (slug = their GitHub login) — or, if an
account with that slug was pre-created by the CLI (e.g. `account create`),
their GitHub identity **claims** it. Everyone signs in at
`/api/auth/github/login` (the "Sign in with GitHub" link on the landing page).

### Set up the GitHub OAuth app

1. Go to https://github.com/settings/developers → **New OAuth App**.
2. Set the **Authorization callback URL** to `{your site}/api/auth/github/callback`
   (e.g. `http://localhost:3000/api/auth/github/callback` for local dev).
3. Copy the **Client ID** and generate a **Client Secret**.

Then set three environment variables:

- `GITHUB_OAUTH_CLIENT_ID` — the OAuth app's client ID.
- `GITHUB_OAUTH_CLIENT_SECRET` — the OAuth app's client secret.
- `SESSION_SECRET` — signs the session + OAuth-state cookies (`openssl rand -base64 32`). Rotating it logs everyone out.

### Roles and admin consoles

- Each owner manages their own account at `/{username}/admin` (their conversations and forwarded questions).
- A **super-admin** runs the cross-account console at `/admin`. Grant the super-admin role from the CLI:

  ```bash
  pnpm admin account promote <username>   # make <username> a super-admin
  pnpm admin account demote <username>    # revoke it
  ```

  `pnpm backfill:root` also seeds the house account (`ROOT_ACCOUNT_USERNAME`) as a super-admin automatically.

`ADMIN_PASSWORD` is no longer a browser login — it is the CLI-only machine
login for `admin sync/status --remote`.

## Environment

- `RESEND_API_KEY` — API key for the Resend transactional-email service.
- `FORWARD_NOTIFICATION_TO` — email address that receives forwarded questions.
- `FORWARD_NOTIFICATION_FROM` — verified sender address used as the `from`.

## Editing the knowledge base

> **Building your own content repo?** See
> [docs/content-repo-guide.md](docs/content-repo-guide.md) for the full,
> step-by-step guide to the repo layout, every file's schema, validation, and
> connecting it from your admin.

The KB is just files in your content repo. Edit them, commit, and re-sync from the admin Content tab; the agent picks up the new content on the next sync.

- `kb/profile.yaml` — name, headline, location, links
- `kb/skills.yaml` — skills with self-rated level (1–5) and years
- `kb/education.yaml` — schools / degrees
- `kb/public-contact.yaml` — public email + links
- `kb/experience/*.md` — one file per role. Frontmatter has structured facts; body has narrative ("What we do", "Highlights", "Stories").
- `kb/projects/*.md` — one file per project, same shape.

Validation runs at build time (via Zod schemas in `lib/kb/schemas.ts`); a malformed file fails the build with a clear message.

## Editing the agent's behavior

Open `prompts/system.md` in your content repo. Edit, commit, re-sync. The point of keeping it in a public content repo is that anyone can audit exactly how the agent is instructed.

## Testing

```bash
pnpm test          # unit tests
pnpm typecheck     # TS only
pnpm build         # full Next.js build (runs KB validation first)
```

## Evals

Golden-question regression suite. Each YAML under `evals/questions/` describes a
question, the KB files the answer must cite, phrases that must appear, and
phrases that must not. Run them against the live model:

```bash
ANTHROPIC_API_KEY=... pnpm evals
```

Exits non-zero on any failure: exit `1` means at least one eval failed (a
real regression in answer quality); exit `2` means the runner could not
start (missing API key, KB load error). CI can gate on `== 1` to surface
quality regressions separately from infrastructure flakes.

Add new questions by dropping a new `*.yaml` in the folder.

## MCP server

queritae exposes the CV agent over the [Model Context Protocol](https://modelcontextprotocol.io)
at a single Streamable-HTTP endpoint:

```
POST /api/mcp     — JSON-RPC requests
GET  /api/mcp     — server→client SSE stream
DELETE /api/mcp   — session teardown
```

Point any MCP client at `https://<deployment>/api/mcp` (Streamable-HTTP transport).
The endpoint is **public** — querying public CV content needs no credentials.

### Tools

| Tool | Input | Result |
|---|---|---|
| `ask` | `question` (string), `conversationId?` (uuid) | `{ answer, conversationId }` — reuse `conversationId` on follow-ups |
| `forward_question` | `question` (string), `conversationId?` (uuid) | `{ ok: true, id }` — queues a question for Alexandre |

Requests are rate-limited per client IP.

## Deployment

Push to a Vercel project linked to this repo. Set `ANTHROPIC_API_KEY` and (optionally) override `NEXT_PUBLIC_REPO_URL` / `NEXT_PUBLIC_REPO_BRANCH` if you've forked.

## What's in this version

- Public chat at `/` answering questions about Alexandre, grounded in `kb/`.
- "Ask Alexandre" inline button that forwards a question when the agent hits a knowledge gap.
- Conversation logging in Postgres for follow-up.
- Admin panel for reviewing conversations + forwarded questions.

## License

MIT.

## Talk to it from your own agent

queritae is also an MCP server. See [docs/MCP.md](docs/MCP.md) for connector
configs (Claude Desktop, Cursor, raw HTTP).

