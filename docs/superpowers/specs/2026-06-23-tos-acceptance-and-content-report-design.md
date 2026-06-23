# ToS acceptance + lean content-report — design

> ROADMAP Phase 3, first batch. Status: design approved 2026-06-23.
> Context: the product is already live and billing on queritae.com. This batch
> closes the two most liability-sensitive Phase 3 items that have an
> engineering surface: a Terms-acceptance gate at login, and a content-report
> path on persona pages. Suspension (the other half of the roadmap's
> "Account suspension … plus a content-report path" line) already works via the
> `disabled` account status, so the report path is its substantive remainder.

## Goals

1. Every account holder accepts the Terms before using any authenticated
   surface — enforced server-side, not just advisory.
2. A visitor on any persona page can report it, with zero new persistence.
3. The legal pages the gate points at exist.

Non-goals: lawyer-reviewed copy, GDPR data export/delete, report persistence or
an admin review queue, ToS re-prompting on version bumps, and the cosmetic
"Disable"→"Suspend" admin relabel.

## Two features, one migration

The features are independent and could ship separately; they share only
migration `0016` and the `lib/language.ts` strings file, so they're batched.

---

## Data model — migration `0016`

One nullable column on `accounts` ([lib/db/schema.ts](../../../lib/db/schema.ts)):

```ts
tosAcceptedAt: timestamp("tos_accepted_at", { withTimezone: true }),
```

- Nullable, no default. Existing rows get `null`, so every current account
  (including root/super-admin) is treated as not-yet-accepted and hits the
  interstitial on its next authenticated request.
- Generated with `db:generate` (drizzle-kit), applied with `db:migrate`.
- **Timestamp-only.** A future `tosVersion` column would enable re-prompting on
  ToS changes; explicitly out of scope now. The timestamp records *when*, which
  is the legally meaningful fact for a single-version policy.

---

## Feature 1 — ToS acceptance

### Legal pages (public, unauthenticated)

`app/terms/page.tsx` and `app/privacy/page.tsx` — static server components.

- Copy is drafted SaaS + EU-aware boilerplate. Each page renders a **visible
  banner** at the top: *"Draft — review before relying on this. Not legal
  advice."* so the placeholder status is never ambiguous.
- No auth, no data. Linked from the interstitial (the required surface) and
  reachable directly by URL. A persistent footer link on the landing page is a
  nice-to-have, deferred out of this batch.

### Interstitial — `app/auth/accept-tos/page.tsx`

Server component:

1. Resolve the session account via `requireSessionAccount()`.
2. If no session → redirect to the login entry.
3. If `tosAcceptedAt` is already set → redirect to `returnTo` (validated) or the
   user's admin. (So the page is idempotent — re-visiting after accepting just
   bounces through.)
4. Otherwise render a client form: a short plain-language summary, links to
   `/terms` and `/privacy` (open in a new tab), a **required** checkbox, and an
   "I agree" submit. The `returnTo` query param is threaded through as a hidden
   field.

The form posts to the accept route. Keeping the page a server component means
the not-yet-authenticated and already-accepted cases never render the form.

### Accept route — `app/api/auth/accept-tos/route.ts` (POST)

1. Require a session (`requireSessionAccount()`); 401-equivalent redirect to
   login if absent.
2. Set `tosAcceptedAt = now()` for that account id.
3. Redirect to `returnTo` **after validating it is a safe local path** —
   must start with a single `/`, must not start with `//`, must not contain a
   scheme. Anything else falls back to the account's admin path. This closes the
   open-redirect that a raw `returnTo` would open.

Validation lives in a pure helper `safeReturnTo(raw: string | null, fallback: string): string`
so it is unit-testable.

### Enforcement — guard at the authenticated boundary

The "guard authenticated routes" decision: an active account without
`tosAcceptedAt` is redirected to the interstitial on its **next authenticated
request**, not only at fresh OAuth login.

One pure predicate, reused everywhere:

```ts
// lib/accounts/guard.ts
export function needsTosAcceptance(account: Account): boolean {
  return account.status === "active" && account.tosAcceptedAt == null;
}
```

Hook points (all already flow through `requireSessionAccount`):

| Surface | File | Change |
|---|---|---|
| Per-account admin gate | [app/[username]/admin/resolve.ts](../../../app/%5Busername%5D/admin/resolve.ts) | `AdminResolution` gains `{ kind: "needs-tos" }`, returned when `needsTosAcceptance(session)`. The consuming layout/page redirects to `/auth/accept-tos?returnTo=<current path>`. |
| Super-admin console gate | [app/admin/load.ts](../../../app/admin/load.ts) | After `requireSuperAdmin()`, return a `needs-tos` signal when the predicate holds; the page redirects likewise. |
| OAuth callback fast-path | [app/api/auth/github/callback/route.ts](../../../app/api/auth/github/callback/route.ts) | When `account.status === "active" && !account.tosAcceptedAt`, redirect to `/auth/accept-tos` instead of `/<username>/admin`, so fresh logins don't bounce through admin first. |

The check targets the **session** account (the logged-in human accepting the
terms), not the administered target — a super-admin administering someone else
must still have accepted personally.

**Loop-safety:** the guard lives only *inside* authenticated layouts/gates.
`/auth/accept-tos`, `/terms`, `/privacy` are outside them, so the redirect can
never cycle. Waitlisted/disabled accounts never reach a gated surface, so they
are exempt until approved-and-active; they accept on their first real admin
visit thereafter.

### ToS data flow

```
login / any authed request
   └─ requireSessionAccount() → Account{tosAcceptedAt}
        └─ needsTosAcceptance? ──yes──> redirect /auth/accept-tos?returnTo=…
        │                                  └─ form → POST /api/auth/accept-tos
        │                                       └─ set tosAcceptedAt=now()
        │                                            └─ redirect safeReturnTo(…)
        └──no──> proceed to the requested surface
```

---

## Feature 2 — Content-report (lean mailto)

No persistence. A visitor opens the persona's "About" popover and clicks
"Report this persona", which opens their mail client prefilled.

### Configuration

- `REPORT_EMAIL` env var, default `abuse@queritae.com`. Read **server-side
  only** (in the persona page), so the address is not embedded in client bundles
  beyond the single rendered `mailto:` href.

### Mailto builder — `lib/report/mailto.ts`

```ts
buildReportMailto(email: string, ctx: { slug: string; displayName: string; url: string }): string
```

Returns `mailto:<email>?subject=…&body=…` with:
- subject: `Report: <displayName> (<url>)`
- body: a short template naming the persona URL and asking for the reason.

Pure and unit-tested (URL-encoding, slug/displayName interpolation).

### UI — `components/about-popover.tsx`

- A new `report: string` field on `AboutPopoverStrings`.
- A **divider-separated row** below the existing transparency links rendering
  the `report` label as a `mailto:` anchor. The popover already renders a
  `links` array; the report row is visually separated to read as an action, not
  a source link.
- The href is built on the **server** (persona page) and threaded
  `HomePageClient → HomeShell → AboutPopover` alongside the existing persona
  context. `home-shell.tsx` passes it down; no env read on the client.

### Report data flow

```
persona page (server)
   ├─ REPORT_EMAIL (env)
   └─ buildReportMailto(email, {slug, displayName, url})
        └─ HomePageClient → HomeShell → AboutPopover (mailto anchor)
```

---

## Cross-cutting

### i18n

New user-facing strings — the interstitial copy (summary, checkbox label,
agree/links) and the `report` label — are added to
[lib/language.ts](../../../lib/language.ts) in both **EN and FR**, matching the
existing string-table pattern that already feeds `AboutPopoverStrings`. The
legal page bodies are English-first; a FR translation is a later content task,
not a blocker for the gate.

### Testing

Unit (pure, no DB/DOM):
- `needsTosAcceptance` across the status × timestamp matrix (active+null →
  true; active+set → false; waitlisted/disabled → false regardless).
- `safeReturnTo` — accepts `/admin`, rejects `//evil.com`, `https://…`,
  `javascript:`, empty; falls back correctly.
- `buildReportMailto` — encoding, subject/body interpolation, special chars in
  displayName.

Integration / route-level (follow existing patterns under `tests/`):
- Accept route sets `tosAcceptedAt` and redirects to a validated target.
- `resolveAccountAdmin` returns `needs-tos` for an active unaccepted session and
  `ok` once accepted.

### Error handling

- Accept route without a session → redirect to login (no silent 500).
- Missing `REPORT_EMAIL` → fall back to the documented default, never render a
  broken `mailto:`.
- `returnTo` hostile input → ignored in favor of the fallback path.

---

## File footprint

**New**
- `app/terms/page.tsx`, `app/privacy/page.tsx`
- `app/auth/accept-tos/page.tsx` + its client form component
- `app/api/auth/accept-tos/route.ts`
- `lib/report/mailto.ts`
- migration `lib/db/migrations/0016_*.sql` (+ drizzle meta)
- tests for the pure helpers + the gate/route behavior

**Changed**
- `lib/db/schema.ts` (column)
- `lib/accounts/guard.ts` (`needsTosAcceptance`)
- `app/[username]/admin/resolve.ts` (`needs-tos` variant) + its consumer
- `app/admin/load.ts` (super-admin gate)
- `app/api/auth/github/callback/route.ts` (fast-path)
- `components/about-popover.tsx`, `components/home-shell.tsx`,
  `components/home-page-client.tsx`, the persona page (`app/[username]/page.tsx`)
- `lib/language.ts` (strings)

## Rollout notes

- The migration makes every existing active account see the interstitial once on
  next authenticated access — intended, and the cheapest way to get universal
  acceptance. No backfill.
- `REPORT_EMAIL` must be set (or the `abuse@queritae.com` alias created and
  routed) in the Vercel env before the report link is meaningful.
- Ship order within the batch: migration + schema → enforcement helper + gates →
  interstitial + accept route → legal pages → report mailto. Each is
  independently testable.
