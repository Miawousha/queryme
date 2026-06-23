# Queritae — Operations Runbook

> Operator reference for running queritae.com in production.
> Stack: **Next.js on Vercel** (production deploy on push to `main`) + **Neon**
> (serverless Postgres). This runbook covers the Phase 3 "ops floor": error
> visibility, database backups/restore, and persona-sync health.
>
> Items marked **OPERATOR ACTION** are dashboard/config steps a human runs once
> (or on a cadence); they are not in code.

---

## 1. Error visibility

### Where errors go today

Runtime errors are written to **Vercel Function Logs** via `console.error`
(~25 call sites across `app/` and `lib/`, e.g. the chat handler, Stripe and
GitHub-App webhooks, the MCP route, and the usage-alert cron). Next.js also
logs unhandled server errors automatically. These logs are **ephemeral** in the
Vercel dashboard (short retention) and have **no aggregation, grouping, or
alerting** — a production 500 is invisible unless someone is watching the live
log stream.

### Make errors durable + alertable — Vercel Log Drain

**OPERATOR ACTION (one-time):** route Vercel logs to a destination that can
store, search, and alert on them.

1. Pick a log-drain destination (any of: Better Stack / Logtail, Axiom,
   Datadog, or an HTTP endpoint you own). Most have a free tier suitable for
   this volume.
2. In the destination, create a source/integration and copy its ingest URL or
   install its Vercel integration from the Vercel Marketplace.
3. In **Vercel → the `queryme` project → Settings → Log Drains** (or the
   destination's Vercel integration), add the drain. Scope it to the
   **Production** environment and include **Function** logs at minimum.
4. In the destination, create an **alert** on `level=error` (or matching
   `console.error` output) — e.g. notify when error count > N in 5 minutes.

**Verify:** trigger a known error path in production (or wait for the next real
one) and confirm the event lands in the destination and the alert fires.

**Why not app-side (Sentry, etc.):** deliberately deferred — a log drain is
config-only, needs no dependency or instrumentation, and reuses the logging
already in the code. If error *grouping* and client-side capture become
necessary, revisit with `@sentry/nextjs`.

---

## 2. Database backups & restore (Neon)

Neon provides continuous backups via **history retention / point-in-time
restore (PITR)** — there is no separate "backup job" to run; recovery is done
by restoring to a timestamp within the retention window.

### Verify backups are enabled — checklist

**OPERATOR ACTION (confirm now, then quarterly):**

1. **Neon Console → the production project → Settings → Storage / History
   retention.** Confirm retention is **enabled** and the window is acceptable
   (default is short on the free tier; raise it to at least **7 days** for a
   billing-bearing production DB).
2. Confirm the **production branch** (the one `DATABASE_URL` points at) is the
   one with retention — not a stale dev branch.
3. Record the current retention window and project ID below.

   - Production Neon project ID: `__________`
   - History retention window: `______ days` (confirmed: `YYYY-MM-DD`)

### Restore procedure

To recover from data loss or a bad migration:

1. **Stop writes** if practical (put the app in maintenance / disable the
   affected path) so you restore to a clean point.
2. In the **Neon Console**, create a **branch from a past timestamp** (just
   before the incident) — this gives an isolated copy of the data at that point
   without overwriting the live branch.
3. Inspect the restored branch to confirm it has the expected data.
4. Either (a) point the app's `POSTGRES_URL` at the restored branch and promote
   it, or (b) selectively copy the needed rows back into the live branch.
5. After recovery, re-run any migrations that were legitimately applied after
   the restore point (see `lib/db/migrations/` + `npm run db:migrate`).

> Migrations are **forward-only** and applied manually with `npm run db:migrate`
> (there is no migrate-on-deploy step — see §4). A bad migration is recovered by
> PITR, not by a down-migration.

---

## 3. Persona sync health

The per-account persona sync downloads a tenant's content repo as a **GitHub
tarball over HTTPS**, extracts it into a cache under
`PERSONA_CACHE_ROOT` (default **`/tmp/queritae/persona-cache`**), validates the
required files, then **atomically flips a symlink** (`current.new` → rename →
`current`) so reads never see a half-written tree
(`lib/persona-source.ts`, `lib/persona/store.ts`).

On Vercel's serverless runtime, `/tmp` is the **only writable path** and is
**per-instance and ephemeral** — each cold function instance starts with an
empty cache and re-syncs on first use. This is by design; the symlink-swap keeps
each instance's cache consistent.

### Automated coverage

The full round-trip — **download → extract → validate → symlink-flip → resolve
root → files-reachable-through-symlink → DB row** — plus the failure paths
(missing required file → no symlink; commits API 404) is locked by
**`tests/lib/persona-source.test.ts`** (real `mkdtemp` cache root, tarball
served via MSW). No additional automated smoke test is needed; building one
would duplicate this coverage.

### Production smoke procedure (serverless-only behavior)

What unit tests **cannot** cover is the real Vercel `/tmp` filesystem on a cold
instance. Verify that manually after any change to the sync path or a Vercel
runtime upgrade:

1. Trigger a sync for a test account (push to its content repo, or use the
   admin Content tab's sync action).
2. Load that account's public persona page in a **fresh** session and confirm it
   answers (i.e. the KB loaded from `/tmp` after a cold start).
3. Check the Vercel function logs (or the §1 log drain) for sync errors around
   that window — tarball-size-cap rejections, extraction failures, or symlink
   errors.

---

## 4. Deploy notes

- **Production deploy = push to `main`** (Vercel auto-deploys). There is **no
  migration step in the build** (`build` is `next build`; `vercel.json` only
  defines the usage-alert cron).
- **Migrations are a manual pre-deploy step.** When a push includes a new
  `lib/db/migrations/*.sql`, run the migration **against the production DB
  FIRST**, then push — otherwise the deployed code may `SELECT` a column the DB
  doesn't have yet and every account query fails. (This applies to the pending
  `0016_*` ToS migration.)
- **Migrating prod — footgun:** `scripts/migrate.ts` reads `POSTGRES_URL` and
  **auto-loads `.env.local`** (your *local* DB). So a bare `npm run db:migrate`
  migrates local, not prod. To migrate **production**, run it where `.env.local`
  is absent (or doesn't define `POSTGRES_URL`) with the prod URL exported —
  e.g. from a clean checkout / CI, or temporarily move `.env.local` aside:
  `POSTGRES_URL="<prod-neon-url>" npx tsx scripts/migrate.ts`. Confirm the
  expected `ALTER TABLE` ran, then push.
- Environment variables that must be set in Vercel Production: `SESSION_SECRET`,
  `POSTGRES_URL`, Stripe keys, GitHub OAuth/App credentials, `ANTHROPIC_API_KEY`,
  `ROOT_ACCOUNT_USERNAME`, and **`REPORT_EMAIL`** (content-report mailto target;
  defaults to `abuse@queritae.com` if unset).
