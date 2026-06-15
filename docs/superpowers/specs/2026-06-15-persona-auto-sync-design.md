# Opt-In Automatic Content Sync

> Design approved 2026-06-15. Automates persona content sync via a per-repo
> GitHub `push` webhook, opt-in per account from the admin Content tab. The
> heavier paths (server-side OAuth hook creation, reconciliation polling) are
> deliberately deferred; see "Scope" below.

## Context & goal

Syncing a persona's content from its GitHub repo is **manual** today: the owner
clicks "Sync" in the admin Content tab, or runs `pnpm admin sync [--remote
<url>]`. The content primitive that does the work —
`syncFromGitHubForAccount(accountId, repoUrl, branch)` in
[lib/persona-source.ts](../../../lib/persona-source.ts) — already has everything
auto-sync needs: per-account in-flight dedupe, full schema validation, staging
promotion, and a last-good guarantee (an invalid push records an error row and
leaves the live page untouched).

**Goal:** when the owner pushes to their content repo, the live persona updates
without anyone clicking anything — opt-in, per account, with no way for an
unverified caller to trigger a sync.

The chosen mechanism (validated in the prior brainstorming session) is a
**per-repo GitHub `push` webhook** that fires to a Queritae endpoint, which
verifies the delivery's HMAC signature and then invokes the existing sync
primitive against the account's **stored** repo + branch.

## Scope

In scope (v1):

- A new `persona_auto_sync` table: one row per account holding the opt-in flag
  and the per-account webhook signing secret.
- A public, HMAC-gated webhook route `POST /api/a/[username]/sync-webhook` that
  verifies GitHub's signature and triggers a sync of the stored source.
- A session-gated admin route `POST/GET /api/a/[username]/admin/auto-sync` to
  enable / disable / regenerate-secret and to reveal the webhook URL + secret.
- A new `AutoSyncPanel` admin component on the existing `/settings/content`
  page, mirroring the existing copy/reveal patterns.

Explicitly out of scope (YAGNI for v1 — deferred, not rejected):

- **Server-side OAuth hook creation.** Creating the hook for the user via the
  GitHub API would require broadening OAuth scope to `admin:repo_hook`,
  persisting an encrypted GitHub token per account, and forcing every existing
  user to re-auth — a large new security surface for a convenience. The table's
  nullable `webhook_id` column is the zero-cost seam for adding it later.
- **Reconciliation polling cron.** A periodic "compare stored SHA vs repo tip"
  poll would catch missed deliveries and cover owners who lack repo-admin
  rights. Deferred by decision; webhook-only for v1.
- **Trailing-edge debounce.** A push that lands while a sync is already
  in-flight is coalesced by the existing in-flight map; the sync resolves the
  branch tip at its *start*, so a push arriving mid-sync may not be included
  until the next push or a manual Sync. Documented limitation, not a v1 feature.
- **Onboarding auto-wiring.** The panel exposes everything the agent-first
  onboarding needs (URL, secret, a ready `gh api ... /hooks` command); wiring
  the onboarding flow to call it is a separate follow-up.

## Setup model: manual + agent-assisted (no OAuth)

Queritae **reveals** the webhook URL + signing secret in the Content tab. The
hook is then created on the repo one of two ways, both of which keep Queritae
free of any stored GitHub token:

- **By the owner**, pasting URL + secret into GitHub → repo Settings → Webhooks
  (Payload URL, `application/json`, secret, `push` event).
- **By the agent-first onboarding**, running `gh api repos/:owner/:repo/hooks`
  with the revealed values using the user's *local* `gh` auth — "automatic
  setup" with nothing persisted server-side.

This is strictly better than server-side OAuth creation for this codebase: no
scope escalation, no per-account token to encrypt/rotate/breach-plan, no re-auth
friction. The nullable `webhook_id` column documents the seam if server-side
creation is ever wanted.

## Architecture

Four units, each with one purpose and an independently testable boundary:

```
GitHub repo ──push──▶ POST /api/a/[username]/sync-webhook   (public, HMAC-gated)
                            │  verify sig → decide → ack 200
                            │  after(): syncFromGitHubForAccount(stored repo+branch)
                            ▼
                      lib/auto-sync/verify.ts   (pure: verify + decide, no I/O)
                            ▲
admin Content page ──▶ POST /api/a/[username]/admin/auto-sync  (session-gated)
   AutoSyncPanel         enable / disable / regenerate-secret
                            ▼
                      persona_auto_sync   (per-account config + secret)
```

The sync primitive (`syncFromGitHubForAccount`) is **reused untouched**.

### Unit 1 — `persona_auto_sync` table (data model)

One row per account. This is **config**, not history — which is exactly why it
is a new table and not new columns on `persona_source` (that table is
append-only sync history, one row per attempt).

`lib/db/schema.ts`:

| column | type | notes |
|---|---|---|
| `id` | uuid pk default `gen_random_uuid()` | |
| `account_id` | uuid → `accounts.id`, notNull, **unique** | one config per account |
| `enabled` | boolean notNull default `false` | pause without destroying the secret |
| `secret` | text notNull | HMAC signing secret; generated on first enable |
| `webhook_id` | text nullable | OAuth seam — null in manual mode |
| `last_delivery_at` | timestamptz nullable | last *verified* delivery received (observability) |
| `created_at` | timestamptz notNull defaultNow | |
| `updated_at` | timestamptz notNull defaultNow | |

Unique index on `account_id`. A Drizzle migration is generated under
`lib/db/migrations/` (matching the existing migration workflow).

**Secret storage:** plaintext in the `secret` column. This is consistent with
the rest of the schema, which has no encryption layer (domains, billing state
are all plaintext), and it is a webhook-signing secret that is *revealed to the
owner* anyway — exactly like Stripe's endpoint secret. The DB is the trust
boundary. Known trade-off, called out here intentionally.

### Unit 2 — webhook route `POST /api/a/[username]/sync-webhook`

Public (GitHub-facing), authenticated **only** by HMAC — never by session. The
`username` in the path identifies the account; `username` is already public (it
is the persona's public handle), and the signature is the gate, mirroring how
Stripe authenticates a per-endpoint secret rather than the path.

Split for testability, matching how `handleStripeWebhook` is a pure function
over injected deps:

- **`lib/auto-sync/verify.ts`** — pure, no I/O:
  - `verifySignature(secret, rawBody, signatureHeader): boolean` — computes
    `sha256=` + HMAC-SHA256(secret, rawBody) and compares against the
    `X-Hub-Signature-256` header with `crypto.timingSafeEqual` (constant-time;
    length-guarded so `timingSafeEqual` never throws on a length mismatch).
  - `decideAction({ event, ref, enabled, branch }): "sync" | "skip" | "pong"` —
    pure routing of a *verified* delivery.
- **`lib/auto-sync/repo.ts`** — DB access: `getAutoSyncConfig(accountId)`,
  `touchLastDelivery(accountId)`, plus the admin mutators (Unit 3).
- **route.ts** — thin orchestration: read raw body → resolve account by
  username → load config → `verifySignature` → `decideAction` → on `"sync"`,
  ack 200 and `after(() => syncFromGitHubForAccount(...))`.

**Execution model:** the route acks **200 immediately** after a verified,
eligible push, then runs the sync in Next 15's `after()` (from `next/server`).
GitHub gets a fast response and never retries on a slow or failed sync; the
sync's own error handling records failures to `persona_source` history, already
surfaced in the Content tab. This decouples "delivery received" from "sync
succeeded" — the webhook's job is to *trigger an attempt*, not guarantee
success.

**Stored-source-only (security):** the repo + branch to sync come from the
account's **active `persona_source` row** (`getActivePersonaSourceRowForAccount`)
— *never* from the webhook payload. The payload's repository field is ignored
entirely. This is what prevents an attacker (even one who somehow had the
secret) from redirecting a sync to a repo they control. The branch filter in
`decideAction` compares the push `ref` against this stored branch.

**Response table:**

| Condition | Status | Sync? |
|---|---|---|
| No config row / secret | 404 | no |
| Missing or invalid signature | 401 | **no** |
| Valid sig, `enabled = false` | 200 | no |
| Valid sig, `X-GitHub-Event: ping` | 200 `{pong:true}` | no |
| Valid sig, `push` to a non-stored branch | 200 | no |
| Valid sig, `push` to the stored branch | 200 (then `after`) | yes |
| Valid sig, `push` but no active source row | 200 | no (nothing configured to sync) |

On the `"sync"` path the route also stamps `last_delivery_at` (observability;
distinct from sync history, which only records syncs that actually ran).

### Unit 3 — admin config route + `AutoSyncPanel`

**`/api/a/[username]/admin/auto-sync`** — session-gated via `resolveAccountAdmin`
(owner or super-admin), same pattern as the existing persona-source admin route.
**No plan gate** — available to all accounts (free + pro), per decision.

- `GET` → `{ enabled, configured, webhookUrl, secret, lastDeliveryAt }`.
  `webhookUrl` is the absolute URL to the sync-webhook endpoint, built by
  `webhookUrlFor(username)` (Unit 4). `secret` is revealed because
  the owner needs it to configure the hook. `configured` is whether a row
  exists.
- `POST { action }`:
  - `"enable"` — create the row if absent (generating a 32-byte random secret),
    set `enabled = true`. Returns `webhookUrl` + `secret`.
  - `"disable"` — set `enabled = false`, **keep the secret** (so re-enabling is
    instant and an already-installed GitHub hook keeps working when re-enabled).
  - `"regenerate"` — generate a new secret. Returns it, with a UI warning that
    the GitHub hook must be updated.

Secret generation: `crypto.randomBytes(32).toString("hex")`.

**`components/admin/auto-sync-panel.tsx`** — a new client component rendered on
the existing `/settings/content` page **below** `ContentTab` (kept separate so
each component stays single-purpose; `ContentTab` is already a ~183-line client
doing three jobs). It contains:

- An enable/disable toggle (POSTs `action`).
- When enabled: the webhook URL and secret, each with a copy-to-clipboard button
  (reusing the clipboard pattern from
  [components/admin/kb-setup-steps.tsx](../../../components/admin/kb-setup-steps.tsx)),
  a "Regenerate secret" button with a "you must update GitHub" warning, brief
  setup steps (Payload URL / `application/json` / secret / `push` event), and a
  copy-pasteable `gh api repos/:owner/:repo/hooks` command for the agent-first
  path.
- Styled with the existing `components/admin/ui.tsx` constants + CSS variables.

The `/settings/content` server page (`app/[username]/admin/settings/content/
page.tsx`) renders `<ContentTab .../>` then `<AutoSyncPanel .../>`, passing the
same `apiBasePath` + `username`.

### Unit 4 — secret + URL plumbing helpers

Small shared helpers, kept with the code that uses them:
- `generateSecret()` in `lib/auto-sync/repo.ts` → hex string, used by the
  `enable` / `regenerate` mutators.
- `webhookUrlFor(username)` in `lib/auto-sync/url.ts` → absolute URL string,
  single source of truth used by both the admin GET response and any
  docs/onboarding copy. It builds on the **same base-URL helper the existing
  billing/email code already uses** (rather than introducing a new origin
  source); the plan will identify and reuse that helper.

## Data flow

1. Owner opens Content tab → toggles Auto-sync on → admin route creates the
   `persona_auto_sync` row with a fresh secret and returns URL + secret.
2. Owner (or onboarding agent via `gh`) installs the `push` webhook on the repo
   with that URL + secret.
3. Owner pushes a commit → GitHub POSTs the `push` delivery to the webhook
   route.
4. Route verifies the signature, confirms `enabled` + branch match, acks 200,
   and `after()` runs `syncFromGitHubForAccount(accountId, storedRepoUrl,
   storedBranch)`.
5. The sync validates and (if valid) promotes the new content; the result is
   recorded in `persona_source` history and shown in the Content tab. An invalid
   push records an error and leaves the live page on the last-good content.

## Security constraints (must hold)

These are the hard constraints from the brief, mapped to where they live:

1. **Never sync on an unverified payload.** `verifySignature` gates every sync;
   a missing/invalid signature returns 401 with no sync triggered. Prevents
   sync-spam DoS (repeated tarball download/extract/validate) by anyone without
   the secret.
2. **Only ever sync the stored repo + branch.** The repo/branch come from the
   active `persona_source` row; the payload's repository is ignored. Prevents
   redirecting a sync to an attacker's repo.
3. **Debounce/dedupe rapid pushes.** The existing per-account in-flight map in
   `syncFromGitHubForAccount` coalesces concurrent syncs.
4. **Fail closed.** No config row, no secret, or `enabled = false` → no sync.
   The tarball size cap is already enforced by the sync primitive.

## Error handling

- Bad/missing signature → 401 (genuine auth failure; GitHub surfaces it in the
  webhook's delivery log so the owner can see a misconfigured secret).
- Verified but ineligible (disabled / wrong branch / ping / no active source) →
  200 ack, no work — GitHub must not retry these.
- Sync failure (fetch, validation, promotion) → handled entirely inside the
  reused sync primitive: records an error row, keeps last-good content. The
  webhook already acked 200, so there is no GitHub retry storm; the next push or
  a manual Sync reconciles.

## Testing approach

- **Unit (pure, no I/O):**
  - `verifySignature`: valid, tampered body, wrong secret, missing header,
    length-mismatched header (must not throw), constant-time path.
  - `decideAction`: every row of the response table (ping, disabled, wrong
    branch, eligible push, non-push event).
- **Integration:**
  - Webhook route with a real HMAC-signed body: asserts a sync is triggered
    *only* on the eligible-push path and *never* on an unverified or ineligible
    delivery; asserts the stored repo/branch is used and the payload repo is
    ignored.
  - Admin route: enable → row created with secret; disable → `enabled=false`,
    secret retained; regenerate → new secret returned and persisted; GET reveals
    URL + secret.
- Reuses the existing Stripe-webhook and persona-source test patterns.

## Files touched

New:
- `lib/db/schema.ts` (+ generated migration under `lib/db/migrations/`)
- `lib/auto-sync/verify.ts`, `lib/auto-sync/repo.ts`, `lib/auto-sync/url.ts`
- `app/api/a/[username]/sync-webhook/route.ts`
- `app/api/a/[username]/admin/auto-sync/route.ts`
- `components/admin/auto-sync-panel.tsx`
- Test files mirroring the above.

Changed:
- `app/[username]/admin/settings/content/page.tsx` (render `AutoSyncPanel`).
