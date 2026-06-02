# Custom Domains (Vanity Hosting) — Design

**Date:** 2026-06-02
**Status:** Approved (pending implementation plan)

## Purpose

Let an account owner serve their queryme chat/resume page on **their own
domain** (e.g. `cv.alex.com`) instead of only at `queryme.app/alex`. The page
renders **in place** — the visitor's URL bar stays on the custom domain (full
white-label vanity hosting), with TLS handled automatically.

Today the account → page mapping is **path-based**: `loadAccountForSlug`
resolves `/[username]` to an account, and the bare domain `/` serves the
marketing landing page (`app/page.tsx`). This feature adds a **host-based**
entry point that reuses the existing `/[username]` routes untouched.

## Decisions

| Decision | Choice |
|---|---|
| Visitor behavior | **Vanity hosting** — render in place; URL bar stays on the custom domain. (Not a redirect.) |
| Hosting / TLS | **Vercel-primary.** Each domain is attached to the Vercel project via the Domains API; Vercel auto-provisions and renews the cert. |
| Control surface (v1) | **Full self-serve** — the account owner adds/verifies/removes domains from their per-account admin page. |
| Domain shape (v1) | **Subdomain only** (e.g. `cv.alex.com`) via a single `CNAME → cname.vercel-dns.com`. Apex deferred. |
| Host → account resolution | **Approach A** — `middleware.ts` reads `Host`, looks it up in an Upstash KV map, and rewrites `/` → `/[slug]`. Existing routes unchanged. |
| Custom-domain surface | **Public persona page only.** Admin/auth stay on the platform domain (the `queryme_session` cookie is not present cross-host). |
| Domain limit | `MAX_DOMAINS_PER_ACCOUNT` = **3**. |
| Uniqueness | `domains.hostname` is **globally unique** — one host maps to exactly one account. |

## Background

- The bare domain `/` serves the **marketing landing page** (`app/page.tsx` →
  `<LandingPage seeItLiveUsername={ROOT_ACCOUNT_USERNAME} />`), not a persona.
- Each account's persona page lives at `app/[username]/page.tsx`. It already
  renders `<HomePageClient apiBasePath={`/api/a/${account.username}`} isRootAccount={false} />`,
  so its client calls **absolute, username-namespaced** API paths
  (`/api/a/alex/chat`, `/api/a/alex/kb`, …). These work on any host.
- `middleware.ts` already runs on every page route (matcher excludes `api`,
  `_next/static`, `_next/image`, `favicon.ico`) to set a per-request
  nonce-based CSP. It runs on Vercel's **Edge runtime**.
- `lib/accounts/repo.ts` has `getAccountBySlug`, `resolveAccountSlug` (rejects
  `RESERVED_SLUGS`), and `loadAccountForSlug`. Reserved slugs are in
  `lib/accounts/slug.ts`.
- The per-account admin page + APIs gate on `resolveAccountAdmin(username)`
  (`app/[username]/admin/resolve.ts`), which returns `not-found` / `login` /
  `{ ok, account }`. The reply route adds a second ownership check
  (`getQuestionAccountId(id) === account.id`) — the pattern to mirror.
- KV: `lib/kv/client.ts` branches between `ioredis` (self-host, TCP) and
  Upstash REST. **`ioredis` cannot run on the Edge runtime**, so middleware must
  use the Upstash REST path directly.
- DB driver (`lib/db/client.ts`) already uses Neon's HTTP driver for Neon hosts.

## Data flow (end to end)

1. **Add.** In their admin page the owner enters `cv.alex.com`. The
   `POST /api/a/[username]/admin/domains` route → `resolveAccountAdmin` →
   `addDomainForAccount`: normalize, validate (subdomain-only, not reserved/
   platform-owned), enforce per-account limit + global uniqueness, call
   `vercel.addProjectDomain`, insert a `domains` row (`status: 'pending'`,
   `verification` from Vercel). Response includes the DNS record to set:
   **CNAME `cv` → `cname.vercel-dns.com`**.
2. **Verify.** The owner sets the CNAME and clicks **Verify** →
   `POST /api/a/[username]/admin/domains/[id]/refresh` → `refreshStatus`:
   re-query Vercel (`getProjectDomain` + `getDomainConfig`). When `verified &&
   !misconfigured`, Vercel has issued the cert; flip the row to `'active'`, set
   `verifiedAt`, and **write `domain:cv.alex.com → alex` to KV** (no TTL).
3. **Serve.** A visitor hits `https://cv.alex.com/`. `middleware.ts` sees a
   non-platform host, finds `alex` in KV, and **rewrites `/` → `/alex`**. The
   `/[username]` page renders; its client calls `/api/a/alex/*` on the same
   host. URL bar stays `cv.alex.com`.
4. **Remove.** `DELETE` → `vercel.removeProjectDomain` → delete row → delete KV
   key.

## Components

### `domains` table (`lib/db/schema.ts` + Drizzle migration)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | `gen_random_uuid()` |
| `accountId` | uuid → `accounts.id` | not null |
| `hostname` | text | lowercased; **unique index** |
| `status` | text enum | `'pending' \| 'active' \| 'error'` |
| `verification` | jsonb | Vercel verification challenges, if any |
| `lastError` | text | nullable; last Vercel/validation error |
| `createdAt` | timestamptz | default now |
| `verifiedAt` | timestamptz | nullable |
| `lastCheckedAt` | timestamptz | nullable |

Indexes: unique on `hostname`, index on `accountId`.

### `lib/domains/vercel.ts`

Thin client over `https://api.vercel.com`, reading `VERCEL_TOKEN`,
`VERCEL_PROJECT_ID`, optional `VERCEL_TEAM_ID` (appended as `?teamId=`):
- `addProjectDomain(host)` — `POST /v10/projects/{projectId}/domains`
- `getProjectDomain(host)` — `GET /v9/projects/{projectId}/domains/{host}` → `{ verified, verification }`
- `getDomainConfig(host)` — `GET /v6/domains/{host}/config` → `{ misconfigured }`
- `verifyProjectDomain(host)` — `POST /v9/projects/{projectId}/domains/{host}/verify`
- `removeProjectDomain(host)` — `DELETE /v9/projects/{projectId}/domains/{host}`

Non-2xx responses throw a typed error carrying Vercel's `error.code`/message.

### `lib/domains/service.ts`

The single seam the API (and any future CLI) calls:
- `addDomainForAccount(db, account, hostnameRaw)` — normalize → validate →
  limit → uniqueness → `vercel.addProjectDomain` → insert. Returns the row +
  derived DNS instructions.
- `refreshStatus(db, row)` — re-query Vercel, recompute status, write/delete the
  KV entry on activate/deactivate, update `lastCheckedAt`/`lastError`.
- `removeDomainForAccount(db, account, domainId)` — ownership check →
  `vercel.removeProjectDomain` → delete row → delete KV key.
- `listDomainsForAccount(db, accountId)`.

### `lib/domains/edge-cache.ts`

A minimal **Upstash REST** reader/writer (`getDomainSlug` / `setDomainSlug` /
`delDomainSlug`), key `domain:<host>`, value = slug. REST (not `ioredis`)
because it is read from the Edge runtime. Keys are **persistent** (no TTL),
written on activate and deleted on remove, so a cold cache never silently
breaks a live domain.

### `middleware.ts` (extend existing)

Before the CSP block, add host resolution. Factor the decision into a pure,
unit-testable helper:

```ts
// host already lowercased + port-stripped
function isPlatformHost(host: string): boolean; // PLATFORM_HOST, *.vercel.app, localhost, 127.*
async function resolveCustomHost(host, lookup): Promise<string | null>; // → slug | null
```

- Platform host → existing flow unchanged.
- KV hit → rewrite `pathname` `/` to `/${slug}` (`NextResponse.rewrite`), still
  stamping the CSP nonce headers.
- KV miss → fall through (landing / 404).
- **KV read failure → fail open** to normal routing (a KV blip must not 500 the
  whole site).

### Self-serve API — `app/api/a/[username]/admin/domains/`

- `route.ts` — `GET` (list with status), `POST` (add → returns row + DNS records).
- `[id]/route.ts` — `DELETE` (remove); `[id]/refresh/route.ts` — `POST` (re-check).

Every route calls `resolveAccountAdmin(username)` first; `[id]` routes also
verify the row's `accountId === account.id` (defense in depth, mirroring the
reply route).

### UI — `components/admin/domains-panel.tsx`

A "Custom domain" card in the per-account admin page: add input, a list with
status badges (Pending DNS / Active / Error), the copy-pasteable CNAME
instruction (`Type: CNAME`, `Name: <sub>`, `Value: cname.vercel-dns.com`), and
Verify / Remove buttons. Client component over the APIs above. Auto-polls
`refresh` every ~4s **only while a row is `pending`**; manual Verify otherwise.

## Guardrails

- **Subdomain-only:** reject bare apex (≤ 2 labels) and syntactically invalid
  hosts with a clear message; reject any `PLATFORM_HOST`-owned name.
- **Limit:** `MAX_DOMAINS_PER_ACCOUNT` = 3.
- **Global uniqueness:** unique `hostname`; attempting a host already attached
  (here or on the Vercel project under another account) → `taken`.
- **Public surface only:** middleware rewrites only `/` → `/[slug]`; admin/auth
  are not exposed on custom hosts.

## Error handling

- Validation → `400` with a human message (`invalid` / `apex-not-supported` /
  `limit-reached` / `taken`).
- Vercel API error → captured into `lastError`, surfaced in the UI, row marked
  `'error'`.
- Middleware KV failure → fail open.

## Config / env (`.env.example`)

`VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID` (optional), `PLATFORM_HOST`
(e.g. `queryme.app`). `MAX_DOMAINS_PER_ACCOUNT` as a constant.

## Files touched

- `lib/db/schema.ts` + new `lib/db/migrations/*` — `domains` table.
- `lib/domains/vercel.ts`, `lib/domains/service.ts`, `lib/domains/edge-cache.ts`,
  `lib/domains/validate.ts` (hostname normalize/validate) — new.
- `middleware.ts` — host resolution + rewrite; extract `resolveCustomHost`.
- `app/api/a/[username]/admin/domains/route.ts`,
  `app/api/a/[username]/admin/domains/[id]/route.ts`,
  `app/api/a/[username]/admin/domains/[id]/refresh/route.ts` — new.
- `components/admin/domains-panel.tsx` — new; wired into the per-account admin page.
- `.env.example` — Vercel + `PLATFORM_HOST` vars.

## Testing (vitest, existing setup)

- `lib/domains/validate` — normalization + validation (apex rejection, invalid,
  reserved, platform-owned).
- `resolveCustomHost` / `isPlatformHost` — pure functions: platform-host
  passthrough, custom-host rewrite, unknown-host passthrough, KV-failure
  fail-open.
- `lib/domains/service` — mocked Vercel client + in-memory db: uniqueness,
  limit, `pending → active` writes the KV entry, remove deletes it.
- `lib/domains/vercel` — against a `fetch` mock.
- API routes — guard tests (non-owner → 404), add/list/delete happy paths with a
  mocked service.

## Out of scope (YAGNI)

- **Apex domains** (`alex.com` + `www` redirect) — subdomain-only in v1.
- **CLI management** — self-serve UI only in v1 (the service layer keeps a CLI a
  thin future addition).
- **Self-host TLS** (Caddy/Traefik on-demand) — Vercel-primary in v1.
- **Per-account `<title>`/metadata on vanity pages** — they currently inherit the
  root layout's metadata; easy follow-up via the rewritten slug in `headers()`.
- **Domain transfer** between accounts.
