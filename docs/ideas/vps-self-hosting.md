# Future idea — VPS / self-hosted deployment

> Status: **idea / not scheduled.** Captured 2026-05-20. The project currently
> deploys to Vercel; this note records the analysis for a future self-hostable
> packaging so the thinking isn't lost.

## Goal

Make queryme installable on any VPS with a near-one-command setup
(`git clone` → fill a few secrets → `docker compose up -d`), while keeping the
existing Vercel deployment working from the same repo. Motivation: data
sovereignty and a frictionless install for anyone who has a VPS.

## Why it's a small lift

The codebase is already portable:

- Every API route uses `runtime = "nodejs"` — no edge-only code.
- Service clients are HTTP-based: `@neondatabase/serverless`, `@upstash/redis`,
  Resend, Anthropic — all reachable from any host.
- The KV layer is already an interface (`KvClient` with a swappable `UpstashKv`
  class), so changing the Redis backend is localized.

Vercel and Docker artifacts coexist without conflict: Vercel detects Next.js
from `next.config.ts` + `package.json` and ignores `Dockerfile` /
`docker-compose.yml` / `Caddyfile`.

## Recommended shape — "Option C": selectable drivers

The app picks its database/cache drivers from env vars, so one image serves
both targets:

- **Vercel path:** managed Neon (Postgres) + Upstash (Redis), as today.
- **VPS path:** `docker compose up -d` bundles Postgres + Redis + the Next.js
  app + a reverse proxy (Caddy, for automatic HTTPS). Migrations run on start.

### Code changes required

- `lib/db/client.ts` + `scripts/migrate.ts` — support `drizzle-orm/node-postgres`
  (`pg`) in addition to the current `neon-http` driver, selected by env.
- `lib/kv/client.ts` — add an `ioredis`-backed `KvClient` alongside `UpstashKv`,
  selected by env. The interface already exists; only `getKv()` + a new class.
- Drizzle's schema is driver-agnostic — no schema changes.

### New files

- `Dockerfile` (multi-stage; needs `output: "standalone"` in `next.config.ts`)
- `.dockerignore`
- `docker-compose.yml` (app + postgres + redis + caddy)
- `Caddyfile`
- `.env.example` additions for the self-hosted variables

## Open question — email

Verification-code email is the one piece that can't be bundled (a fresh VPS IP
can't deliver mail reliably). Resolution to decide later:

- Make the email sender **pluggable** — support generic SMTP *and* Resend,
  selected by env. Vercel keeps Resend; VPS installers use either.
- **Degrade gracefully** — if no sender is configured, disable the
  identification / sensitive-content feature; the public chat still works.

## Gotcha to fix during this work

The `start` script is `env -u ANTHROPIC_API_KEY -u ANTHROPIC_BASE_URL next start`
— a workaround for a polluted *local dev machine* env. On a VPS this would strip
a legitimately-set `ANTHROPIC_API_KEY`. The containerized `start` must take the
key from the `.env` file (which Next.js loads) or use an adjusted start command.

## Rough effort

- Option A (containerize app only, keep managed services): ~1 hour.
- Option C (selectable drivers + bundled Postgres/Redis/Caddy compose): ~half a
  day, plus the email decision.
