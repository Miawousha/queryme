# Multi-Tenant Accounts + KB Linking — Design

**Date:** 2026-06-01
**Status:** Approved (pending implementation plan)

## Purpose

Lift queryme from a single-persona app into a multi-tenant one: anyone signs in
with GitHub, links a **public** KB repo, and gets a live queryable CV at
`/{github-username}`. The current owner stays at `/` as the "house" account.
Per-account configuration for **email** and **custom DNS** is persisted now as
inert fields so those features can be switched on later without re-architecture.
Billing is out of scope.

The spine of the work is turning the single global persona — resolved through a
process-wide symlink and cached in process-global singletons — into content and
caches **keyed by account**. Everything else (auth, routing, admin scoping)
hangs off that.

## Decisions

| Decision | Choice |
|---|---|
| Auth | **GitHub OAuth** only. Scope `read:user user:email`. The OAuth access token is **discarded** after identifying the user (public repos need no token at sync time). |
| Account identity | `github_id` is the stable identity key (survives GitHub renames). `username` (the GitHub login) is the **URL slug**, captured at signup, **immutable for v1**. |
| URL model | Root/house account served at `/` (`ROOT_ACCOUNT_USERNAME`). All other accounts at `/{username}`. |
| Reserved slugs | `about`, `cv`, `admin`, `api`, `_next`, `sitemap.xml`, `favicon.ico`, `login`, `signup` — rejected at account creation. |
| KB repo visibility | **Public repos only.** Keeps the existing unauthenticated tarball sync; no sensitive token stored. |
| Content storage | **Approach A** — per-account lazy filesystem cache (extends today's `/tmp` symlink machinery), behind a `PersonaStore` seam so Approach B (materialize to a store) stays swappable later. |
| In-memory caches | Per-account **LRU maps** (cap ~50 accounts), keyed by `accountId`, replacing the process-global KB/prompt/persona singletons. |
| Session | Reuse the existing HMAC-signed-cookie pattern (`lib/admin/auth.ts`), payload extended to `accountId.expiry`, keyed by a new `SESSION_SECRET` (replaces `ADMIN_PASSWORD`). |
| Email / DNS | Stored on `account_settings` but **inert** in v1: email gated by `forward_email_enabled` (default off); DNS fields stored only, no routing/TLS. |
| Billing | Out of scope. Schema chosen so metering can attach to `conversations.account_id` later. |

## Background (current single-tenant state)

- **One** active persona is resolved through `getActivePersonaRoot()`
  (`lib/persona-source.ts:203`), reading the symlink `…/persona-cache/current`.
  `syncFromGitHub(repoUrl, branch)` downloads a public tarball from
  `codeload.github.com`, validates required files (`validatePersonaTree`),
  atomically flips the symlink, and records a `persona_source` row. A single
  module-level `inFlight` promise dedupes concurrent syncs; `ensurePersonaCacheReady()`
  cold-start-refetches the latest `ok` row's recorded SHA.
- **KB / prompt / persona caches are process-global singletons**
  (`lib/kb/cache`, `lib/prompts`, `lib/persona`), invalidated by `resetKbCache()`,
  `_resetPromptCache()`, `_resetPersonaCache()` after a sync.
- **Auth is a single shared password.** `lib/admin/auth.ts` issues an
  HMAC-SHA256 signed, expiring session token in an httpOnly cookie
  (`queryme_admin`), keyed by `ADMIN_PASSWORD`. `isAdminAuthenticated()` returns
  false when the password is unset.
- **`/api/chat`** (`app/api/chat/route.ts`) calls `ensurePersonaCacheReady()`,
  returns 503 `persona_not_configured` when no root is set, rate-limits via
  `getKv()` + `checkRateLimit`, persists the conversation via
  `getOrCreateConversation`/`appendTurn`, records interviewer identity via
  `setInterviewer`, then streams `answer()`.
- **DB schema** (`lib/db/schema.ts`): `conversations` (channel, language,
  transcript jsonb, interviewer jsonb), `forwarded_questions` (FK →
  conversations), `persona_source` (repoUrl, branch, commitSha, status, error).
  None carry an account reference today.
- **Routing**: `middleware.ts` does per-request CSP only — no tenant resolution.
  Top-level routes today: `/` (chat), `/about`, `/cv`, `/admin`, plus `/api/*`.
- **Local dev / override**: `PERSONA_LOCAL_OVERRIDE` short-circuits
  `getActivePersonaRoot()` to a local content dir.

## Data model (Drizzle migration)

New / changed tables in `lib/db/schema.ts`:

- **`accounts`**
  - `id` uuid PK
  - `github_id` text **unique, not null** — stable identity
  - `username` text **unique, not null** — URL slug (GitHub login at signup)
  - `created_at` timestamptz default now()
- **`account_settings`** (1:1 with account)
  - `account_id` uuid PK/FK → accounts
  - `forward_email_to` text null
  - `forward_email_enabled` boolean not null default false
  - `custom_domain` text null
  - `custom_domain_status` text not null default `'none'` (enum: `none|pending|verified`)
  - Typed columns (not a JSON blob) so each future toggle is an explicit migration.
- **`persona_source`** — add `account_id` uuid FK → accounts. "Active persona for
  an account" = its latest `status='ok'` row. Indexes: `(account_id, synced_at DESC)`.
- **`conversations`** — add `account_id` uuid FK → accounts. Scopes transcripts +
  interviewer per account. Index `(account_id, last_message_at DESC)`.
- **`forwarded_questions`** — unchanged; account is derived through its
  `conversation_id` join (no denormalized column — YAGNI).

## Auth — GitHub OAuth

New routes under `app/api/auth/`:

- **`/api/auth/github/login`** — builds the GitHub authorize URL (scope
  `read:user user:email`, a signed `state` param to defend CSRF) and 302s to it.
- **`/api/auth/github/callback`** — verifies `state`, exchanges `code` for an
  access token, calls `GET https://api.github.com/user` (+ `/user/emails` if
  needed), then **upserts** an account by `github_id` (creating
  `account_settings` on first login), **discards the token**, mints a session
  cookie, and redirects to the account's admin.
- **`/api/auth/logout`** — clears the session cookie.

Session: extend `lib/admin/auth.ts` so the token payload is
`${accountId}.${expiresAt}` signed with `SESSION_SECRET`. A new
`getSessionAccountId(): Promise<string | null>` reads + verifies the cookie and
returns the owning account id. `ADMIN_PASSWORD` and `verifyPassword` are removed.

New env: `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET`, `SESSION_SECRET`,
`ROOT_ACCOUNT_USERNAME`.

## Routing & tenant resolution

- **`/`** → renders the **root account** (looked up by `ROOT_ACCOUNT_USERNAME`).
  Existing `/about`, `/cv`, `/admin` remain the root account's surfaces.
- **`app/[username]/`** dynamic segment → resolve account by slug → render that
  account's chat + KB panel; child segments `/{username}/cv`, `/{username}/about`,
  `/{username}/admin`. Unknown or reserved slug → 404.
- **Reserved-slug guard** lives in a shared constant + validator
  (`lib/accounts/slug.ts`), used both by the dynamic segment and by account
  creation.
- **Per-account APIs** namespaced by slug: `/api/a/{username}/chat`,
  `/api/a/{username}/mcp`. Each account thus gets its own MCP endpoint URL. The
  root account keeps `/api/chat` and `/api/mcp` (thin wrappers that resolve to the
  root account). The per-account API resolves `accountId` from the path segment,
  then runs the same logic as today but scoped to that account
  (content resolution, conversation persistence, rate-limit key prefixed by
  account).
- **Middleware** stays CSP-only; tenant resolution happens in route/segment code,
  not middleware.

## Per-account content resolution (Approach A)

Refactor `lib/persona-source.ts` to be account-scoped, behind a `PersonaStore`
interface (`lib/persona/store.ts`) so the FS implementation can later be swapped
for a materialized store:

- `getPersonaRoot(accountId)` reads `…/persona-cache/{accountId}/current`.
- `syncFromGitHub(accountId, repoUrl, branch)` → per-account target dirs
  `…/persona-cache/{accountId}/{sha}`, per-account symlink flip, per-account
  cleanup (keep current + previous).
- `ensurePersonaCacheReady(accountId)` cold-start-refetches that account's latest
  `ok` row.
- In-flight dedupe becomes a `Map<accountId, Promise<SyncResult>>` instead of a
  single module-level promise.

In-memory caches (`lib/kb/cache`, `lib/prompts`, `lib/persona`) become per-account
**LRU maps** (cap ~50) keyed by `accountId`; reset helpers take an `accountId`.
`PERSONA_LOCAL_OVERRIDE` continues to work and maps to the **root account** in dev.

## Account config (deferred features)

The owner's admin exposes editors for the `account_settings` fields, persisted but
**inert** in v1:

- **Email**: `forward_email_to` / `forward_email_enabled`. The forward-question
  handler (`app/api/forward-question`) currently reads global
  `FORWARD_NOTIFICATION_*` env; in the multi-tenant world it will read the
  account's settings, but the path is **gated off** by `forward_email_enabled`
  (default false) for v1. No sending behavior ships now.
- **DNS**: `custom_domain` / `custom_domain_status` stored only. No host-based
  routing, no TLS provisioning in v1.

## Admin scoping

- `/admin` (root) and `/{username}/admin` require a session whose `accountId`
  matches the resolved account (**owner-only**). Non-owners → 404/redirect to
  login.
- `lib/admin/data.ts` and `lib/admin/analytics.ts` queries gain an `account_id`
  filter. Sync controls operate on the authenticated account.

## Signup / onboarding

1. "Create your queryable CV" → `/api/auth/github/login`.
2. Callback creates the account (slug = GitHub login) and lands the user in their
   admin with a **"link your KB repo"** step (the existing persona-source UI,
   scoped to them).
3. They paste a public repo URL → sync → live at `/{username}`.
4. Until a repo is linked, `/{username}` shows the existing "not configured"
   state — the **owner** sees the setup affordance; **visitors** see a friendly
   "not set up yet" placeholder.

## Migration / backfill

A single Drizzle migration plus a one-shot backfill script:

1. Create `accounts` and `account_settings`.
2. Add **nullable** `account_id` to `persona_source` and `conversations`.
3. Seed the **root account** from `ROOT_ACCOUNT_USERNAME` (+ its
   `account_settings` row).
4. Backfill all existing `persona_source` and `conversations` rows to the root
   account id.
5. Set `account_id` **NOT NULL** on both tables.

Safe: a single existing tenant and low row counts; the backfill is a couple of
`UPDATE`s.

## Files touched (indicative)

- `lib/db/schema.ts` — `accounts`, `account_settings`; `account_id` on
  `persona_source` + `conversations`.
- `lib/db/migrations/*` — new migration; `scripts/backfill-root-account.ts`.
- `lib/accounts/` — `repo.ts` (account CRUD/upsert), `slug.ts` (reserved-slug
  validator), `session.ts` (account-scoped session helpers).
- `lib/admin/auth.ts` — payload carries `accountId`; `SESSION_SECRET`; drop
  password path. `lib/admin/data.ts`, `lib/admin/analytics.ts` — `account_id`
  filter.
- `lib/persona/store.ts` (new `PersonaStore` seam) + `lib/persona-source.ts`
  refactor to account-scoped functions.
- `lib/kb/cache`, `lib/prompts`, `lib/persona` — per-account LRU.
- `app/api/auth/github/login/route.ts`, `…/callback/route.ts`,
  `app/api/auth/logout/route.ts`.
- `app/[username]/` segment (`page.tsx`, `cv/`, `about/`, `admin/`),
  `app/api/a/[username]/chat/route.ts`, `…/mcp/route.ts`; root wrappers retained.
- `app/page.tsx`, `app/admin/page.tsx`, etc. — resolve via the root account.
- `.env.example` / `README.md` — new env vars + signup/onboarding docs.

## Edge cases

- **Slug collision with reserved route** → rejected at account creation; the
  `[username]` segment also 404s reserved slugs as defence in depth.
- **Root account reached via its own slug** → `/{ROOT_ACCOUNT_USERNAME}` 302
  redirects to `/` so the house account has one canonical URL (no duplicate
  content / split analytics).
- **GitHub username change** → URL slug is immutable in v1; the account still
  resolves by `github_id` at login. Username rename is noted as future work.
- **Account with no linked repo** → `/{username}` renders the not-configured
  state; `/api/a/{username}/chat` returns 503 `persona_not_configured` (existing
  behavior, now per account).
- **Cold start for a given account** → first request lazily refetches that
  account's tarball (a one-time latency blip), mirroring today's single-tenant
  cold start.
- **LRU eviction** → an evicted account simply re-resolves on next hit; content
  on disk is unaffected.
- **OAuth `state` mismatch / denied consent** → callback aborts to an error page,
  no account created.

## Testing

Existing vitest + testing-library setup; no new infrastructure.

- **Unit**: reserved-slug + username validation; session token sign/verify with
  `accountId` payload; OAuth callback with a mocked GitHub `/user` response
  (account upsert, token discarded); per-account content resolution isolating two
  accounts; account-scoped admin data/analytics filters.
- **Integration**: two accounts with different public repos resolve independent
  content; conversation persistence scoped to the right `account_id`; reserved
  slug rejected end-to-end.
- **Regression**: re-run the existing eval suite against the **root account** to
  confirm no answer-quality regression from the refactor.

## Out of scope (YAGNI)

- Billing / metering (schema leaves `conversations.account_id` as the future
  attach point).
- Actual per-account email sending (fields stored, feature gated off).
- Custom-domain host routing, DNS verification, TLS provisioning (fields stored
  only).
- Private KB repos (requires broad `repo` scope + token storage).
- Account deletion and username/slug rename.
- A dedicated platform landing page at `/` (root stays the house account).
