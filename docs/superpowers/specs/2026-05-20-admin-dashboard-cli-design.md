# Plan 4 — Admin Dashboard + Ops CLI: design

> Status: **approved design**, ready for an implementation plan.
> Date: 2026-05-20. Follows Plan 2 (identification + sensitive content) and is
> independent of Plan 3 (MCP server) — they can ship in either order.

## Goal

Give Alexandre a way to observe and operate the data queryme collects:
conversations, identified askers, and forwarded questions.

Deliberate split:

- **Web admin = observability only.** Read-only dashboards. No forms, no
  mutations, no CSRF surface.
- **CLI = the write path.** All edits and deletes happen through a scriptable
  command-line tool.

KB content (`kb/*.yaml`, `kb/sensitive/*.yaml`) stays out of both — it is
file-edited and committed to git as today.

## Web admin (`/admin`)

### Pages

Server components, reading directly from Postgres via Drizzle. All read-only.

- `/admin` — overview: counts (conversations, askers, open questions) and recent
  activity.
- `/admin/conversations` — list; `/admin/conversations/[id]` — full transcript.
- `/admin/askers` — identified people with verified status.
- `/admin/questions` — forwarded questions, open vs. answered.

### Authentication

Single-user password login with a signed session cookie.

- `/admin/login` — password form → `POST /api/admin/login`.
- The route checks the submitted password against `ADMIN_PASSWORD` (env).
- On success it sets a **signed, httpOnly, secure** session cookie: an HMAC
  (using `ADMIN_SESSION_SECRET`) over a payload containing an issued-at /
  expiry timestamp. TTL ~7 days.
- `middleware.ts` guards `/admin/*` and `/api/admin/*` (except the login route):
  verifies the cookie's HMAC + expiry via Web Crypto; redirects to `/admin/login`
  when missing/invalid/expired.
- `/api/admin/logout` clears the cookie.

The cookie is stateless (no KV/DB session store needed) — HMAC verification is
sufficient for a single-user internal tool.

## Ops CLI (`pnpm admin <command>`)

- `scripts/admin.ts` — dependency-free dispatcher parsing `process.argv`. Loads
  `.env.local` (same pattern as `scripts/migrate.ts`) and connects via
  `getDb()`. No separate auth: holding `POSTGRES_URL` *is* the authorization.
- Command handlers live in `lib/cli/` (separate from the dispatcher so they are
  unit-testable).

### Commands

| Command | Action |
|---|---|
| `conversations list` | List conversations (id, channel, asker, turn count, last activity) |
| `conversation show <id>` | Print a conversation's full transcript |
| `askers list` | List identified askers (name, company, email, verified status) |
| `questions list` | List forwarded questions (open vs. answered) |
| `question answer <id>` | Mark a forwarded question answered (set `answeredAt`) |
| `conversation delete <id>` | Delete a conversation (FK-safe) |
| `asker delete <id>` | Delete an asker (FK-safe) |

Deletes are FK-safe: rows in `questions_for_alex` (and the `conversations`
foreign keys) that reference the target are nulled or removed first so no
constraint violation occurs.

## New code

```
app/admin/layout.tsx               # admin shell
app/admin/page.tsx                 # overview
app/admin/conversations/page.tsx
app/admin/conversations/[id]/page.tsx
app/admin/askers/page.tsx
app/admin/questions/page.tsx
app/admin/login/page.tsx
app/api/admin/login/route.ts
app/api/admin/logout/route.ts
middleware.ts                      # guards /admin/* and /api/admin/*
lib/admin/auth.ts                  # cookie sign / verify (HMAC)
lib/admin/queries.ts               # dashboard read functions
lib/cli/commands.ts                # CLI command handlers
scripts/admin.ts                   # CLI dispatcher
lib/conversations/repo.ts          # + listConversations, deleteConversation
lib/identity/... or a repo          # + listAskers, deleteAsker
.env.example                       # + ADMIN_PASSWORD, ADMIN_SESSION_SECRET
package.json                       # + "admin" script
README.md                          # document admin + CLI
```

(Exact repo-function placement is an implementation detail for the plan.)

## Error handling

- **CLI:** invalid command / missing arguments → usage message, non-zero exit.
  Unknown id → clear "not found" message, non-zero exit. Success → confirmation
  line, zero exit.
- **Web:** missing/invalid/expired cookie → redirect to `/admin/login`. Wrong
  password → form re-renders with an error, no detail leak.

## Testing

- Unit tests: `lib/admin/auth.ts` — a freshly signed cookie verifies; a tampered
  or expired cookie is rejected.
- Unit tests: `lib/cli/commands.ts` — argument parsing and dispatch; the DB is
  injected/stubbed so handlers are tested without a live Postgres.
- DB-touching repo functions (`listConversations`, `deleteConversation`, etc.)
  follow Plan 2's precedent — schema parity via Drizzle, verified by manual
  smoke rather than live-DB integration tests.
- Dashboard pages — light render checks.

## Security notes

- `ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET` are server-only env vars, never
  shipped to the client.
- The session cookie is `httpOnly`, `secure`, `sameSite=lax`.
- The web admin performs no writes, so there is no CSRF-sensitive surface.
- The CLI is an operator tool; its security boundary is possession of
  `POSTGRES_URL`.

## Out of scope

- Emailing replies to askers / answering forwarded questions by email
  (a possible future iteration).
- Promote-question-to-KB auto-PR generation (deferred since Plan 2).
- Weekly digest emails (deferred since Plan 2).
- Multi-user admin / roles.
- KB editing via CLI or web.

## Dependencies on prior work

- Plan 2's `conversations` / `askers` / `questions_for_alex` tables and the
  Drizzle client, all shipped.
