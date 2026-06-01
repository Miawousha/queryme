# Landing Page at `/` + DB Activation — Design

**Date:** 2026-06-01
**Status:** Approved (pending implementation)

## Purpose

Reverse the earlier "house account stays at `/`" decision: the bare domain `/`
now serves a **marketing landing page** advertising the queryme concept (with a
placeholder login button), and the house account moves to `/{username}` like any
other account. Also **activate** the multi-tenant foundation on the live
database by applying the pending migration and backfilling existing rows.

This is the minimal-scope reversal — only `/` flips; the other root surfaces are
left in place.

## Decisions

| Decision | Choice |
|---|---|
| Reversal scope | **Minimal** — only `/` becomes the landing; `/about`, `/cv`, `/admin`, and the root `/api/*` routes are untouched (still resolve the house account via `resolveRootAccountId()`). |
| House account | `Miawousha` — `ROOT_ACCOUNT_USERNAME=Miawousha`, reachable at `/Miawousha`. The linked KB repo (`github.com/Miawousha/queryme`) is independent of the slug. |
| Root-slug redirect | **Removed** — `app/[username]/page.tsx` no longer redirects `ROOT_ACCOUNT_USERNAME`'s slug to `/`, so `/Miawousha` renders the house account's CV. |
| Login button | **Placeholder** — a disabled / "coming soon" "Sign in with GitHub" control. Real OAuth is a later plan. |
| Landing metadata | The landing supplies its own platform-level `title`/`description`; it must not read the house persona. |
| DB changes | **Apply migration `0008`** (additive: `accounts` + nullable `account_id` columns/FKs/indexes), then create the `Miawousha` account and backfill existing `conversations` + `persona_source` rows to it, run against the `.env.local` `POSTGRES_URL`. |

## Background (current state)

- `app/page.tsx` renders the house account's chat via `resolveRootAccountId()` →
  `getPersonaStore()` → `HomePageClient`.
- `app/[username]/page.tsx` resolves a slug to an account and renders it, but
  first does `if (username === process.env.ROOT_ACCOUNT_USERNAME) redirect("/")`.
- `app/layout.tsx` derives `metadata` from the house persona (it resolves the
  root account, loads the persona, builds metadata).
- `resolveRootAccountId()` (`lib/accounts/root.ts`) returns `"local-override"`
  under `PERSONA_LOCAL_OVERRIDE`, else `getRootAccountId(getDb())` (reads
  `ROOT_ACCOUNT_USERNAME`).
- Pending migration: `0008_lovely_network` (the only un-applied one).
- `scripts/backfill-root-account.ts` (`pnpm backfill:root`) creates the root
  account from `ROOT_ACCOUNT_USERNAME` if absent and sets `account_id` on rows
  where it is NULL. Idempotent.

## Components / changes

### Landing page
- **`components/landing/landing-page.tsx`** (new, client or server as needed) —
  the marketing page. Sections: hero (concept pitch), how-it-works (link a public
  GitHub repo → queryable chat + MCP endpoint → nothing hidden), value props, a
  disabled "Sign in with GitHub — coming soon" button, and a "See it live" link
  to `/${ROOT_ACCOUNT_USERNAME}`. Built with the frontend-design skill for a
  distinctive, production-grade look (not generic AI aesthetic). Reuses the
  existing design tokens (`globals.css` CSS variables) and `GridBackground`.
- **`app/page.tsx`** — replace the house-account render with
  `<LandingPage seeItLiveUsername={process.env.ROOT_ACCOUNT_USERNAME ?? null} />`.
  No DB calls; static-friendly.
- **Metadata** — `app/page.tsx` exports its own `metadata` (platform title /
  description / OG). `app/layout.tsx`'s persona-derived metadata must not break
  the landing: keep layout metadata generic OR move the persona-derived metadata
  down to the account routes. Minimal change: have `app/layout.tsx` fall back to
  platform-generic metadata when it can't resolve a house persona, and let
  `app/page.tsx`'s `metadata` override title/description for `/`.

### Routing
- **`app/[username]/page.tsx`** — delete the `ROOT_ACCOUNT_USERNAME → redirect("/")`
  block so the house account renders at `/{username}`.

### DB activation (operational, run against `.env.local` `POSTGRES_URL`)
1. Add `ROOT_ACCOUNT_USERNAME=Miawousha` to `.env.local`.
2. `pnpm db:migrate` — applies `0008` (additive; safe on live data).
3. `pnpm backfill:root` — creates the `Miawousha` account and adopts existing
   NULL-`account_id` rows.
4. Verify: the account row exists; existing `conversations`/`persona_source` rows
   now carry its `account_id`; `/Miawousha` resolves content (cold-start refetch
   from the backfilled `persona_source` row).

## Edge cases
- **Landing has no persona** — it renders zero account content, so a missing
  house persona can't break `/`. The "See it live" link is hidden if
  `ROOT_ACCOUNT_USERNAME` is unset.
- **`/Miawousha` cold start** — first request triggers
  `ensurePersonaCacheReadyForAccount`, which refetches the backfilled SHA into the
  per-account cache. Requires network at request time (same as before).
- **Layout metadata** — must not throw when `/` is the landing; covered by the
  generic-fallback change above.
- **Migration on live data** — `0008` is purely additive (no NOT NULL, no drops),
  so applying it to a populated DB cannot lose or break existing rows.

## Testing
- Unit: a render test for the landing (renders hero copy + a disabled login
  control + the "See it live" link when a username is provided; no login link
  when omitted). Existing `tests/app/about/page.test.tsx` etc. stay green.
- `pnpm typecheck` + `pnpm build` must pass (landing is a valid static route).
- DB activation verified by direct queries after the backfill run.

## Out of scope
- Real GitHub OAuth / functional login / sessions (later plan).
- Per-account `/about`, `/cv`, `/admin` sub-routes; full root de-special-casing.
- `account_id` NOT NULL hardening.
