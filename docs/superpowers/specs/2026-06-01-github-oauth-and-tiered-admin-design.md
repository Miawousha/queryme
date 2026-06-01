# GitHub OAuth + Self-Serve Signup + Tiered Admin — Design

**Date:** 2026-06-01
**Status:** Approved (pending implementation plan)
**Plan:** 2 (builds on the multi-tenant foundation, Plan 1)

## Purpose

Turn the multi-tenant foundation into a self-serve product: a visitor clicks
**"Sign in with GitHub"** on the landing page, authenticates, and — on first
login — gets an account provisioned automatically (slug = GitHub login) with a
live queryable CV at `/{username}`. Authentication is **session-based** and
**per-account scoped**: each owner manages only their own account; a designated
**super-admin** oversees all accounts.

This replaces the single shared-password admin with GitHub OAuth and introduces
two admin tiers:

1. **Per-account admin** at `/{username}/admin` — today's persona-source +
   analytics + forwarded-questions surface, scoped to the owning account.
2. **Super-admin console** at `/admin` — a platform operator view listing all
   accounts, with drill-in to any account's per-account admin.

Per-account email / custom-domain configuration remains deferred to Plan 3.

## Decisions

| Decision | Choice |
|---|---|
| Auth mechanism | **GitHub OAuth only.** Scope `read:user` (login + id; no email — that's Plan 3). The OAuth access token is **discarded** after identifying the user. |
| Session | Extend the existing HMAC-signed-cookie pattern in `lib/admin/auth.ts`. Payload `${accountId}.${expiresAt}`, signed with a new **`SESSION_SECRET`** (replaces `ADMIN_PASSWORD` as the signing key). New `getSessionAccountId()` reader. |
| Cookie | **Renamed** `queryme_admin` → `queryme_session` (no longer admin-only). Existing sessions are invalidated (acceptable — password auth is being removed). |
| Password auth | **CLI-only.** `verifyPassword` and `/api/admin/login` are **retained** but repurposed as a non-interactive **machine login** for the admin CLI's `--remote` ops: a correct `ADMIN_PASSWORD` mints a **root-account** `queryme_session` (signed with `SESSION_SECRET`). The browser `AdminLogin` password form is **deleted** (browser admin is OAuth-only). `isAdminAuthenticated()` is removed in favor of session/role guards. |
| Signup | **Signup == login** (one button). First login auto-provisions the account; subsequent logins resolve it. |
| Account adoption | On callback, resolve by `github_id`; else by `username`. An existing **`github_id`-null** account whose username equals the GitHub login is **claimed** (its `github_id` is set). This adopts the live CLI-created house account on first real login. |
| Super-admin identity | **DB role flag** `accounts.role ('user' \| 'admin')`. Grantable via CLI. Bootstrap: the backfill/migration seeds `ROOT_ACCOUNT_USERNAME`'s account as `'admin'`. |
| Admin URL model | Per-account admin at `/{username}/admin` (including the house account at `/{ROOT_ACCOUNT_USERNAME}/admin`); `/admin` **repurposed** as the super-admin console. |
| Super-admin powers | Drill-in grants **full per-account powers** (sync, reply) for any account; **no destructive account-lifecycle ops** ship this plan ("read-mostly" = the super-console surface adds no destructive actions). |
| `github_id` constraint | **Partial unique index** (`UNIQUE … WHERE github_id IS NOT NULL`) — one account per GitHub identity, still allowing CLI-created null-id accounts. |
| Email / DNS | Deferred to Plan 3 (unchanged). |

## Background (current state, post-Plan 1 + landing)

- **Session/auth** (`lib/admin/auth.ts`): HMAC-SHA256 signed cookie
  `queryme_admin`, payload = `${expiresAt}` only, keyed by `ADMIN_PASSWORD`.
  `verifySessionToken`, `createSessionToken`, `verifyPassword`,
  `isAdminAuthenticated()` exist today. `isAdminAuthenticated()` returns false
  when `ADMIN_PASSWORD` is unset.
- **Admin login** (`app/api/admin/login/route.ts`): password POST, rate-limited
  per IP, mints the cookie. `app/api/admin/logout/route.ts` clears it.
- **Admin gating**: `app/admin/page.tsx` calls `isAdminAuthenticated()` →
  renders `AdminLogin` (password form) or `AdminDashboard`. Every `/api/admin/*`
  route calls `isAdminAuthenticated()` only — **no account scoping**.
- **Admin data is not account-scoped**: `loadAdminData(db)`
  (`lib/admin/data.ts`) selects all conversations; `app/api/admin/analytics`
  selects all conversations + forwarded questions globally.
- **Persona-source admin API** (`app/api/admin/persona-source/route.ts`) already
  resolves `resolveRootAccountId()` and calls the `*ForAccount` functions, but is
  hard-wired to the **root** account regardless of who is logged in.
- **Accounts** (`lib/accounts/repo.ts`, `lib/db/schema.ts`): `accounts` table
  has `id`, `github_id` (nullable text, **no unique constraint**), `username`
  (unique), `created_at`. Repo exposes `createAccount`, `getAccountBySlug`,
  `getAccountById`, `getRootAccount`, `getRootAccountId`, `resolveAccountSlug`.
  `createAccount` accepts `githubId` but there is no upsert-by-`github_id`.
- **Routing**: `app/page.tsx` renders the marketing `LandingPage` (no DB).
  `app/[username]/page.tsx` resolves a slug → renders that account's chat. The
  house account `Miawousha` (`ROOT_ACCOUNT_USERNAME=Miawousha`,
  `github_id`=null) renders at `/Miawousha`. `/about`, `/cv`, `/admin` still
  resolve the house account (minimal-reversal). There is **no `/{username}/admin`
  segment yet**.
- **Landing** (`components/landing/landing-page.tsx`): a disabled "Sign in with
  GitHub" button + "coming soon" pill (around line 95).
- **Migrations**: latest applied is `0008_lovely_network`. `account_id` on
  `conversations` / `persona_source` is still **nullable** (the foundation's
  NOT-NULL hardening was not applied — out of scope here).

## Data model (Drizzle migration `0009`)

Changes to `accounts` in `lib/db/schema.ts`:

- Add `role text not null default 'user'` — application-level enum
  `'user' | 'admin'`.
- Add a **partial unique index** on `github_id`:
  `CREATE UNIQUE INDEX accounts_github_id_unique ON accounts (github_id) WHERE github_id IS NOT NULL;`
  (Drizzle: `uniqueIndex("accounts_github_id_unique").on(table.githubId).where(sql\`github_id IS NOT NULL\`)`.)

No other tables change. `conversations.account_id` / `persona_source.account_id`
nullability is untouched (the per-account admin queries already filter by a
concrete id resolved from the session).

**Bootstrap (super-admin seed):** a one-shot step (extend
`scripts/backfill-root-account.ts` or a new tiny script) sets `role='admin'` on
the `ROOT_ACCOUNT_USERNAME` account so the first operator exists. Idempotent.

## Session & auth (`lib/admin/auth.ts`)

Refactor the file from "admin password session" to "account session":

- `createSessionToken(accountId: string, expiresAt: number, secret: string)` →
  payload `${accountId}.${expiresAt}`, returns `${payload}.${sign(payload, secret)}`.
- `verifySessionToken(token, now, secret)` → returns the `accountId` (string) on
  success, `null` on bad signature / malformed / expired. (Signature covers the
  whole `accountId.expiresAt` payload; parse by splitting on the **last** dot for
  the signature, then the remaining `accountId.expiresAt`.)
- `getSessionAccountId(): Promise<string | null>` — reads the `queryme_session`
  cookie, verifies with `SESSION_SECRET`, returns the account id or null. Returns
  null when `SESSION_SECRET` is unset.
- **Removed:** `isAdminAuthenticated()` and the `ADMIN_COOKIE` constant. Export
  `SESSION_COOKIE = "queryme_session"`, keep `SESSION_TTL_MS`. **Kept:**
  `verifyPassword` (CLI machine login). `auth.ts` stays pure (crypto + cookie
  read only — no DB imports), so it remains trivially unit-testable.

New higher-level guards (new `lib/accounts/guard.ts`):

- `requireSessionAccount(): Promise<Account | null>` — session id → account row.
- `canAdminister(session: Account | null, target: Account): boolean` —
  `!!session && (session.id === target.id || session.role === 'admin')`.
- `requireSuperAdmin(): Promise<Account | null>` — session account with
  `role==='admin'`, else null.
- `requireRootAdmin(): Promise<Account | null>` — session account that
  `canAdminister` the **root** account (i.e. the root owner or a super-admin),
  else null. Used by the CLI machine endpoints (`/api/admin/*`).

(`account_id` UUIDs in the cookie are opaque; the signature prevents forgery, so
no extra per-request DB validation of the id is needed beyond the lookup the
admin page already performs.)

## OAuth flow (new routes under `app/api/auth/`)

- **`github/login/route.ts`** — builds the GitHub authorize URL
  (`https://github.com/login/oauth/authorize`) with `client_id`, `scope=read:user`,
  `redirect_uri`, and a signed `state`. The `state` is a random nonce signed with
  `SESSION_SECRET` and stored in a short-lived (`~10 min`) httpOnly cookie
  (`queryme_oauth_state`); 302 to GitHub.
- **`github/callback/route.ts`** — verify `state` against the cookie (constant-time)
  and clear it; exchange `code` at
  `https://github.com/login/oauth/access_token` for an access token; call
  `GET https://api.github.com/user` (Bearer) → `{ id, login }`; run
  `upsertAccountFromGitHub` (§ provisioning); **discard the token**; mint the
  session cookie via `createSessionToken(account.id, …)`; 302 to
  `/{account.username}/admin`. On `state` mismatch, denied consent
  (`error` param), reserved-login, slug conflict, or upstream failure → 302 to
  `app/auth/error/page.tsx` with a `?reason=<code>` query param (a static page
  that renders a human message + a "back to home" link); **no account is created**
  and **no cookie set** on failure.

`redirect_uri` is `${origin}/api/auth/github/callback`, where `origin` is the
request origin (`req.nextUrl.origin`) — works for localhost and prod as long as
both callback URLs are registered on the GitHub OAuth app.
- **`logout/route.ts`** — clears `queryme_session`; 302 to `/`. Replaces
  `app/api/admin/logout` (the logout button repoints here).

GitHub calls live behind a tiny seam (`lib/auth/github.ts`:
`exchangeCodeForToken`, `fetchGitHubUser`) so tests mock them (MSW or injected
`fetch`) without network.

## Account provisioning & adoption (`lib/accounts/repo.ts`)

`upsertAccountFromGitHub(db, { githubId, login }): Promise<Account>`:

1. `getAccountByGithubId(db, githubId)` → if found, return it (returning user).
2. Else `getAccountBySlug(db, login)`:
   - found with `github_id === null` → **claim**: set `github_id = githubId`,
     return. *(Adopts the CLI-created house account on its owner's first login.)*
   - found with `github_id !== githubId` → throw `SlugConflictError` (slug held by
     a different identity; immutable in v1).
3. Else `createAccount(db, { username: login, githubId, role: 'user' })`. If
   `login` is a reserved slug (`isReservedSlug`), throw `ReservedLoginError`
   **before** inserting.

`createAccount` gains an optional `role`. Add `getAccountByGithubId`. The callback
maps `ReservedLoginError` / `SlugConflictError` to the error page; all other
errors are 500s.

## Routing & admin gating

**Reserved slug:** add `"auth"` to `RESERVED_SLUGS` (`lib/accounts/slug.ts`),
since `/auth/error` and `/api/auth/*` are now real routes. A GitHub user whose
login is `auth` therefore can't auto-provision (handled as a reserved-login error).

### Per-account admin — `app/[username]/admin/`
Mirrors today's `app/admin` dashboard, scoped to the resolved account:
- Resolve account by slug (`resolveAccountSlug`). Unknown/reserved → `notFound()`.
- `const session = await requireSessionAccount();`
  - no session → redirect to `/api/auth/github/login`.
  - `!canAdminister(session, account)` → `notFound()` (don't leak existence).
- Render `AdminDashboard` with `loadAdminData(db, account.id)`.

### Super-admin console — `app/admin/page.tsx` (repurposed)
- `const su = await requireSuperAdmin();` → null → `notFound()`.
- Render the account list (`listAllAccounts`) with per-account links to
  `/{username}/admin`.

### Per-account admin APIs (browser)
The browser per-account admin calls **per-account namespaced** routes under
`/api/a/[username]/admin/*` (matching `/api/a/{username}/chat` from Plan 1), so
the target account comes from the path:

- `/api/a/[username]/admin/persona-source` (GET/POST)
- `/api/a/[username]/admin/analytics` (GET)
- `/api/a/[username]/admin/questions/[id]/reply` (POST)

Each handler: resolve the account by slug (`resolveAccountSlug`; unknown → 404),
`requireSessionAccount()`, then `canAdminister(session, account)` (owner or
super-admin) else 404. Pass the resolved `accountId` into
`getActivePersonaSourceRowForAccount`, `syncFromGitHubForAccount`,
`loadAdminData`, the analytics query, and the questions-reply handler (which also
checks the reply's conversation belongs to the authorized account). The shared
request logic is factored into handler functions (`lib/admin/handlers/*`) that
take an `accountId`, so the per-account routes and the CLI alias below stay DRY.

### Root admin API (CLI machine path)
`/api/admin/persona-source` (GET/POST) is **kept** as a thin **root-scoped**
alias used by the CLI's `--remote` sync/status (`admin-remote.ts` posts to it with
the password-minted session). It resolves the root account
(`resolveRootAccountId()`) and authorizes with `requireRootAdmin()`, then calls
the same shared handlers. `/api/admin/login` (password → root session) is kept;
`/api/admin/logout` is replaced by `/api/auth/logout`. `/api/admin/analytics` and
`/api/admin/questions/[id]/reply` (browser-only, unused by the CLI) **move** to
the namespaced routes above. Every `isAdminAuthenticated()` call site is replaced
by a guard (`requireRootAdmin` for the root alias, `canAdminister` for
per-account routes).

## Super-admin console scope (v1)

`listAllAccounts(db)` returns, per account: `username`, `github_id`, `role`,
`created_at`, **repo-linked status** (does a latest `status='ok'` persona_source
row exist), and **conversation count**. The page renders a table; each row links
to `/{username}/admin`. **No** suspend / delete / rename this plan.

## Account-scoping of admin data

- `lib/admin/data.ts`: `loadAdminData(db, accountId)` filters
  `conversations` and `forwarded_questions` (joined via conversation) by
  `account_id`.
- `app/api/admin/analytics`: filter conversations + forwarded questions by the
  authorized account id.
- The questions-reply handler authorizes the reply against the conversation's
  owning account via `canAdminister`.

## CLI & bootstrap (`scripts/lib/admin-args.ts`, `admin-run.ts`)

- `account promote <username>` / `account demote <username>` — set/clear
  `role='admin'` (JSON output for agent-first use). Extend the existing `account`
  subcommand union (`create` | `link` | `promote` | `demote`).
- Backfill seeds `ROOT_ACCOUNT_USERNAME`'s account `role='admin'` (§ data model).

## Landing wiring (`components/landing/landing-page.tsx`)

Replace the disabled button + "coming soon" pill with a live anchor to
`/api/auth/github/login` ("Sign in with GitHub"), keeping the existing styling
(remove `disabled`/`cursor-not-allowed`/`opacity-70`). The render test asserts a
real link (`href="/api/auth/github/login"`), not a disabled control.

## Environment

New / changed env (`.env.example`, README):

```
# GitHub OAuth app (https://github.com/settings/developers)
GITHUB_OAUTH_CLIENT_ID=
GITHUB_OAUTH_CLIENT_SECRET=
# Callback URL configured on the GitHub app: {SITE_URL}/api/auth/github/callback

# Signs the session + OAuth-state cookies. Rotating it logs everyone out
# (browser and CLI). Generate: openssl rand -base64 32
SESSION_SECRET=
```

`ADMIN_PASSWORD` is **retained** (now documented as the CLI-only machine login for
`admin sync/status --remote`; it no longer gates the browser admin). The README
gains a "Sign in / accounts" section: create a GitHub OAuth app, set
`GITHUB_OAUTH_CLIENT_ID` / `GITHUB_OAUTH_CLIENT_SECRET` / `SESSION_SECRET`, and on
first login the house account owner's existing account is adopted (super-admin via
the backfill seed).

## Migration / cutover

1. Generate + apply `0009` (role column + partial unique index).
2. Seed: run the backfill (sets `ROOT_ACCOUNT_USERNAME` account `role='admin'`).
3. Configure the GitHub OAuth app + add `GITHUB_OAUTH_CLIENT_ID` /
   `GITHUB_OAUTH_CLIENT_SECRET` / `SESSION_SECRET`. Keep `ADMIN_PASSWORD` (CLI).
4. House owner logs in via GitHub → existing `Miawousha` account is **claimed**
   (its `github_id` populated), session minted, lands at `/Miawousha/admin`;
   `/admin` shows the super console.

Cutover risk: browser admin requires `SESSION_SECRET` + OAuth env to be present
before deploy (the browser password form is gone). The CLI keeps working via
`ADMIN_PASSWORD` (which now also requires `SESSION_SECRET` to sign the minted
session). Mitigation: set all three new vars before deploying; verify the claim
flow on first login.

## Edge cases

- **`state` mismatch / denied consent / GitHub error param** → callback aborts to
  the error page; no account created, no cookie set.
- **Reserved GitHub login** (e.g. a user literally named `api`) → provisioning
  rejected with a clear message; no account created.
- **Slug held by a different `github_id`** → `SlugConflictError` → error page
  (slug immutable in v1; rename is future work).
- **Logged-in non-owner hits `/{username}/admin`** → 404 (not 403) to avoid
  account-existence enumeration.
- **Super-admin drill-in** → `canAdminister` returns true for `role==='admin'`,
  so the super-admin sees/operates any account's per-account admin.
- **`SESSION_SECRET` unset** → `getSessionAccountId()` returns null → all admin
  surfaces 404/redirect (fail closed).
- **Token-exchange / `GET /user` failure** → callback 502/error page; no partial
  account state (provisioning runs only after a successful user fetch).

## Testing

Existing vitest + Testing Library + MSW. DB-integration blocks are **opt-in via
`RUN_DB_TESTS`** (skipped by default) so the standard suite stays green.

- **Unit (no DB):**
  - session token sign/verify roundtrip with `accountId` payload; tamper/expiry →
    null; cookie name = `queryme_session`.
  - OAuth `login` builds the correct authorize URL + sets a signed `state` cookie.
  - OAuth `callback` with mocked `exchangeCodeForToken` + `fetchGitHubUser`:
    create path, claim path, conflict path, reserved-login path; asserts the token
    is never persisted; `state` mismatch aborts.
  - guards: `canAdminister` (owner / super / stranger), `requireSuperAdmin`.
  - landing renders a live `/api/auth/github/login` link.
- **DB-integration (`RUN_DB_TESTS`):**
  - `upsertAccountFromGitHub`: create, claim (null→set), conflict (different id);
    partial unique index rejects a duplicate non-null `github_id`.
  - `loadAdminData(db, accountId)` returns only that account's rows
    (two-account isolation).
  - `account promote/demote` flips `role`.
- **Regression:** existing admin/chat/landing tests stay green after the
  password→OAuth refactor (mock `getSessionAccountId` where they mocked
  `isAdminAuthenticated`).

## Out of scope (YAGNI)

- Per-account email forwarding + custom-domain config (Plan 3).
- Private KB repos (needs broad `repo` scope + token storage).
- Account deletion, suspension, username/slug rename.
- Billing / metering.
- Per-account MCP endpoints (`/api/a/{username}/mcp`).
- Capturing/using the GitHub email (no `user:email` scope this plan).
