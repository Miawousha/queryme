# GitHub App for One-Click Auto-Sync

> Design approved 2026-06-16. A Queritae GitHub App makes content-repo
> connection a one-click install: installing the App identifies the account,
> auto-configures the persona source, runs the first sync, and delivers every
> future push automatically. Builds on the per-account auto-sync webhook
> (2026-06-15), which remains the manual fallback. Public repos only in v1;
> private-repo support is a deliberate, non-breaking follow-on.

## Context & goal

Auto-sync (2026-06-15) automates content updates: push to the content repo →
the live page updates. But turning it on is still hand-work — enable it in
admin, then install a per-repo webhook (paste a URL + secret, or run a `gh`
command). This feature removes that last mile from onboarding.

**Goal:** a persona owner installs the **Queritae GitHub App** on their content
repo, and from that single click their page goes live and stays in sync on every
push — no URL paste, no secret, no `gh`. The agent-first onboarding can hand the
user a plain install link; clicking it is the only step.

**Why a GitHub App (vs the per-account webhook we shipped):** one app-level
webhook endpoint and one app-level secret replace per-repo webhook creation and
per-account secrets. The install is revocable from GitHub, and it lays the
groundwork for private content repos later. The cost is one-time app-registration
infra and an install→account mapping; both are modest.

**The join key already exists.** GitHub's `installation` event carries the
installer's GitHub user id (`sender.id`). We already store `accounts.githubId`
(unique) from sign-in, so `sender.id → account` is an unambiguous lookup. That is
why no token or signed state is needed: identity is the mapping.

## Scope

In scope (v1):

- A new nullable `installation_id` column on `persona_auto_sync` mapping a GitHub
  App installation to an account.
- A single app-level webhook route `POST /api/github/app` that HMAC-verifies
  deliveries against the app secret and handles `installation`,
  `installation_repositories`, `push`, and `ping` events.
- A thin install callback `GET /api/github/app/callback` (cosmetic — redirects
  the user back to their admin).
- Admin surfacing: a "Connect with GitHub App" button + connection status in
  `AutoSyncPanel`, fed by the existing admin auto-sync GET.
- An onboarding preamble update so the agent hands the user the install step.

Explicitly out of scope (deferred, not rejected):

- **Private content repos.** Needs the App private key + minted installation
  access tokens + an authenticated content fetch. v1 keeps the unauthenticated
  public tarball fetch and needs **no private key**. Private support is a clean,
  non-breaking add later.
- **Org-identity installs.** If a user installs as a GitHub identity that does
  not match their Queritae `githubId` (e.g. an org-owned flow), the install is
  acknowledged but unmatched and surfaced in admin. Not auto-resolved in v1.
- **Multi-repo selection UX.** If an install selects multiple repos, v1 records
  the install but does not auto-pick a source; the owner picks in admin. The
  common case (the agent installs on the single repo it just built) is handled.
- **Replacing the per-account webhook.** It stays as the manual fallback; the App
  is the recommended path. The two coexist.

## Architecture

```
GitHub ──install──▶ GET  /api/github/app/callback   (cosmetic: redirect to admin)
       ──events───▶ POST /api/github/app            (app-secret HMAC-gated)
                        ├─ installation.created  → identity-map, store installation_id,
                        │                           auto-config source (single repo), first sync
                        ├─ installation.deleted  → disconnect (clear installation_id)
                        ├─ installation_repositories.added → auto-config if none + single repo
                        └─ push                  → sync the STORED source (reuse primitive)
                              ▲
admin Content ──"Connect with GitHub App"──▶ github.com/apps/<slug>/installations/new
```

The sync primitive (`syncFromGitHubForAccount`) and the HMAC verifier
(`verifySignature` in `lib/auto-sync/verify.ts`) are **reused untouched**.

### Unit 1 — data model: `installation_id` on `persona_auto_sync`

`lib/db/schema.ts`: add to the existing `personaAutoSync` table:

| column | type | notes |
|---|---|---|
| `installation_id` | text, nullable | GitHub App installation id (stored as text; GitHub ids are numeric but we never arithmetic on them). Unique-when-present. When set, the account is App-connected. |

Unique partial index `persona_auto_sync_installation_unique` on `installation_id`
`WHERE installation_id IS NOT NULL`. Generated migration `0015` via
`pnpm db:generate`. The existing `secret` / `webhook_id` columns are unused by the
App path but retained (the manual webhook fallback still uses them); the row's
`enabled` flag still gates whether auto-sync runs.

### Unit 2 — install→account + lifecycle DB access

`lib/github-app/repo.ts`:

- Account-by-GitHub-identity lookup reuses the **existing**
  `getAccountByGithubId(db, githubId)` in `lib/accounts/repo.ts:75`. Login stores
  `githubId = String(githubUser.id)` (`app/api/auth/github/callback/route.ts:41`),
  so the webhook's `String(sender.id)` is the matching key — no type drift.
- `findAccountIdByInstallation(installationId: string): Promise<string | null>` —
  the account whose `persona_auto_sync.installation_id` matches.
- `connectInstallation(accountId, installationId): Promise<void>` — upsert the
  `persona_auto_sync` row: set `installation_id`, `enabled = true`, and a
  `secret` (generate one if absent, so the row satisfies the not-null column and
  the manual fallback stays usable). Idempotent.
- `disconnectInstallation(installationId): Promise<void>` — clear
  `installation_id` for the matching row (keep the row + secret; the manual path
  remains).

### Unit 3 — pure event routing

`lib/github-app/events.ts` (no I/O, fully unit-testable, mirrors `decideAction`):

- `parseDelivery(event, payload)` → a normalized, discriminated result the route
  acts on, e.g.:
  - `{ kind: "install"; installationId; githubUserId; repos: string[] }` for
    `installation.created`.
  - `{ kind: "uninstall"; installationId }` for `installation.deleted`.
  - `{ kind: "repos-added"; installationId; repos: string[] }` for
    `installation_repositories.added`.
  - `{ kind: "push"; installationId; repoFullName; ref }` for `push`.
  - `{ kind: "pong" }` for `ping`.
  - `{ kind: "ignore" }` for everything else (other actions/events).
- `pushMatchesSource(repoFullName, ref, sourceRepoUrl, sourceBranch): boolean` —
  true only when the pushed repo and branch equal the account's stored source
  (the security filter; ignores pushes for other repos/branches the App may also
  be installed on). Reuses `parseGitHubRepoUrl` to compare `owner/repo`.

### Unit 4 — the app webhook route

`POST /api/github/app/route.ts` (`runtime = "nodejs"`):

1. If `GITHUB_APP_WEBHOOK_SECRET` is unset → 500 (fail closed and loud, mirroring
   the Stripe route).
2. Read the **raw** body. `verifySignature(secret, rawBody, X-Hub-Signature-256)`
   (reused) → 401 on failure. **Never act on an unverified delivery.**
3. Parse JSON; `parseDelivery(X-GitHub-Event, payload)`.
4. Act on the normalized delivery, always acking 200 after verification:
   - **install:** `getAccountByGithubId(db, String(githubUserId))`. No match → 200
     ack + log "unmatched install" (surfaced in admin as not-connected). Match →
     `connectInstallation(accountId, installationId)`; if `repos.length === 1`,
     run `after(() => syncFromGitHubForAccount(accountId,
     "https://github.com/<full_name>", "main"))`. Running the sync **is** how the
     source is configured: the primitive records the `persona_source` row, which
     `getActivePersonaSourceRowForAccount` then returns — there is no separate
     "set source" write.
   - **uninstall:** `disconnectInstallation(installationId)`; 200.
   - **repos-added:** if the account has no active source and exactly one repo was
     added, auto-config + first sync (same as install). Else 200 ack.
   - **push:** `findAccountIdByInstallation(installationId)`; no match or
     auto-sync disabled → 200 skip. Load the active source; if
     `pushMatchesSource(...)` → `touchLastDelivery` + `after(() =>
     syncFromGitHubForAccount(accountId, repoUrl, branch))`; else 200 skip.
   - **pong:** 200 `{ pong: true }`.
   - **ignore:** 200.

Execution mirrors the per-account webhook: verify → ack 200 → run the sync in
`after()` so a slow/failed sync never makes GitHub retry; failures are recorded
in `persona_source` history. The repo+branch synced always come from the stored
active source, never the raw push payload's list of changed files.

### Unit 5 — install callback (cosmetic)

`GET /api/github/app/callback/route.ts`: GitHub's App "Setup URL". After an
install GitHub redirects here with `installation_id` + `setup_action`. The
**mapping is done by the webhook** (`installation.created`), so the callback only
provides good UX: resolve the current session account and redirect to
`/<username>/admin/settings/content?app=installed`. No session → redirect to
login, then back. The callback performs no privileged mutation.

### Unit 6 — admin surfacing

- `app/api/a/[username]/admin/auto-sync/route.ts`: the `view()` gains
  `connectedViaApp: boolean` (true when `installation_id` is set) and
  `appInstallUrl: string | null` (`https://github.com/apps/<GITHUB_APP_SLUG>/installations/new`,
  or null when the env is unset).
- `components/admin/auto-sync-panel.tsx`: when `appInstallUrl` is present, show a
  primary **"Connect with GitHub App (recommended)"** link-button and a status
  line (`Connected via GitHub App ✓` when `connectedViaApp`). The existing manual
  webhook UI stays below as the fallback.

### Unit 7 — onboarding preamble

`docs/agent-setup-preamble.md` step 6 ("Hand off") changes from "tell the user to
paste the repo URL in admin → Sync" to: "tell the user to open their Queritae
admin → **Content → Connect with GitHub App** and install it on the repo you just
built — that is the whole connection step; their page goes live and auto-updates
on every push." (Served verbatim at `/setup-guide.md`, so onboarding updates with
it.)

## Data flow (happy path)

1. Agent builds + pushes the public content repo using the user's `gh`.
2. Agent hands the user the install link (or says "Connect with GitHub App in
   admin").
3. User installs the App on that one repo; GitHub fires `installation.created`.
4. The app webhook verifies the signature, maps `sender.id → account`, stores
   `installation_id`, sets the repo as the persona source, and first-syncs.
5. The user is redirected (callback) to their admin Content page showing
   "Connected via GitHub App ✓".
6. Every future push fires `push` to the same endpoint → verified → the stored
   source re-syncs. Invalid content records an error and keeps last-good, exactly
   as today.

## Security constraints (must hold)

1. **Verify every delivery** against the app-level secret with `verifySignature`
   (constant-time) before any action; missing/invalid → 401, no work. Fail closed
   if the secret env is unset.
2. **Sync only the stored source.** The repo+branch come from the account's
   active `persona_source` row; `pushMatchesSource` rejects pushes for any other
   repo/branch the App is installed on. The push payload never chooses the repo.
3. **Identity mapping is exact.** `sender.id → accounts.githubId` (unique). An
   unmatched installer is acked and ignored, never guessed.
4. **Ack-don't-retry.** Every verified delivery returns 2xx; the sync runs in
   `after()`, so GitHub never retries on a slow/failed sync.

## Error handling

- Missing/invalid signature → 401. Unset app secret → 500 (config bug).
- Unmatched installer, disabled auto-sync, non-source repo/branch, unhandled
  event/action → 200 ack, no work.
- Sync failure → contained in the reused primitive (records an error row, keeps
  last-good); the `after()` callback catches its own throw and logs, mirroring the
  per-account webhook.

## Ops (one-time, documented not coded)

Register the "Queritae" GitHub App in GitHub:
- Webhook URL `https://queritae.com/api/github/app`, a generated webhook secret.
- Setup URL `https://queritae.com/api/github/app/callback`.
- Permissions: **Contents: Read-only**, **Metadata: Read-only**. Subscribe to
  the **Push** event. (The `installation` / `installation_repositories` lifecycle
  events are delivered to every GitHub App automatically — no subscription.)
- No private key is used in v1 (deliveries are signed with the webhook secret;
  content is fetched from the public tarball).
- New env (local + Vercel): `GITHUB_APP_SLUG` (for the install URL),
  `GITHUB_APP_WEBHOOK_SECRET`.

A short ops note is added to the repo docs listing these env vars and the
registration steps.

## Testing approach

- **Unit (pure):** `parseDelivery` for each event/action (install single/multi
  repo, uninstall, repos-added, push, ping, ignored), and `pushMatchesSource`
  (matching repo+branch, wrong branch, wrong repo). `verifySignature` is already
  covered.
- **Integration (route, mocked deps via `vi.doMock`, real HMAC):**
  - `installation.created` with a matching `sender.id` → `connectInstallation`
    called and, for a single repo, the source is configured and synced; an
    unmatched `sender.id` → no-op 200.
  - `push` from the configured installation+repo+branch → syncs the stored
    source; a push for a different repo/branch → no sync; a push for an unknown
    installation → no sync.
  - `installation.deleted` → `disconnectInstallation`.
  - bad/missing signature → 401, no calls.
- **Admin view:** GET returns `connectedViaApp` + `appInstallUrl` correctly for
  connected / not-connected / env-unset.
- Reuses the per-account webhook and admin-route test patterns.

## Files touched

New:
- `lib/db/schema.ts` (+ generated migration under `lib/db/migrations/`)
- `lib/github-app/events.ts`, `lib/github-app/repo.ts`
- `app/api/github/app/route.ts`, `app/api/github/app/callback/route.ts`
- Test files mirroring the above.

Changed:
- `app/api/a/[username]/admin/auto-sync/route.ts` (`view()` adds App fields)
- `components/admin/auto-sync-panel.tsx` (App button + status)
- `docs/agent-setup-preamble.md` (step 6)
- A short ops/env note in the repo docs.

Reused unchanged: `getAccountByGithubId` (`lib/accounts/repo.ts`),
`verifySignature` (`lib/auto-sync/verify.ts`), `syncFromGitHubForAccount` +
`getActivePersonaSourceRowForAccount` + `parseGitHubRepoUrl`
(`lib/persona-source.ts`).
