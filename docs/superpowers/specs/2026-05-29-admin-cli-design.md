# Queryme Admin CLI — Design

**Date:** 2026-05-29
**Status:** Approved (pending implementation plan)

## Purpose

A command-line tool for operating queryme's headless-persona machinery: sync
persona content from its external GitHub repo, inspect sync status/history, and
run database migrations. It works against the local dev environment by default
and can drive a deployed instance over the existing admin HTTP API.

**Primary operator: Claude (an agent), not a human at a terminal.** The CLI is
therefore designed agent-first — structured output, non-interactive by default,
and self-describing. Human terminal use is supported but secondary.

## Background

The headless-persona feature (merged 2026-05-29) made queryme a content-free
shell. Persona content lives in an external GitHub repo and is synced into a
per-instance filesystem cache plus a shared DB row.

Relevant existing pieces:

- `lib/persona-source.ts`
  - `syncFromGitHub(repoUrl, branch="main"): Promise<SyncResult>` — resolves the
    latest SHA, downloads + extracts the tarball, validates required files,
    atomically flips the `current` symlink, records a DB row, invalidates
    in-process caches. Writes to a **per-instance** cache at
    `PERSONA_CACHE_ROOT ?? /tmp/queryme/persona-cache`.
  - `getActivePersonaSourceRow(): Promise<PersonaSource | null>` — latest `ok` row.
  - `listSyncHistory(limit=10): Promise<PersonaSource[]>`.
  - `SyncResult = { kind:"ok"; commitSha; syncedAt } | { kind:"error"; message }`.
- `app/api/admin/persona-source/route.ts`
  - `GET` → `{ active, history }` (gated by `isAdminAuthenticated()`).
  - `POST { repoUrl, branch? }` → `{ commitSha, syncedAt }` or `{ error }` (400).
- `app/api/admin/login/route.ts` — `POST { password }` → sets `queryme_admin`
  httpOnly cookie; rate-limited per IP (10 / 15 min).
- `lib/admin/auth.ts` — session is an HMAC of the expiry keyed by `ADMIN_PASSWORD`.
- `scripts/migrate.ts` — runs the drizzle migrator against `POSTGRES_URL`;
  routes Neon-http vs postgres-js by host. Run via `pnpm db:migrate`.
- Script conventions: standalone `tsx` files in `scripts/`, `process.loadEnvFile(".env.local")`,
  plain `main().catch(err => { process.exit(1) })`, no CLI framework dependency.

### Key architectural constraint

`syncFromGitHub` writes to a **per-instance** filesystem cache. A *local* sync
populates the local `/tmp` cache and writes a (possibly shared) DB row, but it
does **not** refresh a running deployed instance's cache. To update live
deployed content you must hit that instance's HTTP endpoint (`--remote`), which
runs the sync inside the deployed process and invalidates its in-process caches.
A local sync against the prod DB only takes effect on prod's next cold start
(via `ensurePersonaCacheReady`, which refetches the recorded SHA). This is why
remote mode exists and must be documented in the CLI's help and output hints.

## Decisions

| Decision | Choice |
|---|---|
| Target model | Unified: local default, `--remote <url>` drives the deployed instance over the admin HTTP API. Migrations always go direct-DB. |
| Remote auth | Reuse `ADMIN_PASSWORD` → `POST /api/admin/login` → session cookie. No server changes. |
| Remote migrate | None. Migrations need only DB access; point `POSTGRES_URL` at the target DB. No migrate endpoint is added. |
| Packaging / arg parsing | `tsx` script + Node `util.parseArgs`. Matches existing `scripts/` conventions, zero new dependencies. |

## Command surface

```
pnpm admin sync    [repoUrl] [--branch <name>] [--remote <url>] [--dry-run] [--json|--pretty] [--interactive] [--verbose]
pnpm admin status  [--remote <url>] [--json|--pretty]
pnpm admin migrate [--dry-run] [--json|--pretty]
pnpm admin help    [--json]
```

A `"admin": "tsx scripts/admin-cli.ts"` entry is added to `package.json` scripts.

### `sync`

Re-sync persona content from GitHub.

- `repoUrl` is optional. If omitted, defaults to the currently-active source's
  `repoUrl` (and `branch`), so bare `pnpm admin sync` means "re-pull latest".
  - Local: read the default from `getActivePersonaSourceRow()`.
  - Remote: read it from `GET /api/admin/persona-source` (`active`).
  - If there is no active source and no `repoUrl` given → operation error with a
    hint to pass a `repoUrl`.
- `--branch` overrides the branch (defaults to the active row's branch, else `main`).
- Local execution calls `syncFromGitHub(repoUrl, branch)` directly.
- Remote execution: login → `POST /api/admin/persona-source { repoUrl, branch }`.
- `--dry-run`: resolve the latest SHA on the branch and report whether it differs
  from the active SHA (would-change vs no-op) **without** downloading/flipping.
  - Local: call the GitHub commits API for the SHA (the same call `doSync` makes
    first), compare to `getActivePersonaSourceRow().commitSha`. Do not download
    the tarball or flip the symlink.
  - Remote: read `active` via `GET`, resolve latest SHA via the GitHub commits
    API, compare. Never `POST`.
- `result` includes `changed: boolean`, `commitSha`, `previousSha`, `syncedAt`,
  `mode: "local" | "remote"`, `dryRun: boolean`. `previousSha` is the active
  SHA before the operation; `changed = commitSha !== previousSha`. Because the
  remote `POST` returns only `{ commitSha, syncedAt }`, remote actual-sync
  captures `previousSha` from a `GET` issued before the `POST`. Local sync reads
  `previousSha` from `getActivePersonaSourceRow()` before calling `syncFromGitHub`.

### `status`

Show the active persona source plus recent sync history.

- Local: `getActivePersonaSourceRow()` + `listSyncHistory(10)`.
- Remote: login → `GET /api/admin/persona-source` → `{ active, history }`.
- Pretty mode: a compact summary (active repo/branch/SHA/synced-at/status) and a
  short history table. JSON mode: `{ active, history }` verbatim.

### `migrate`

Run drizzle migrations against `POSTGRES_URL`. Always direct-DB.

- `--remote` is rejected here (usage error, exit 2) with hint: "migrate targets
  the database directly — set POSTGRES_URL to the target database".
- `--dry-run`: list pending migration files (in `lib/db/migrations`) that have
  not yet been applied, without applying them. (Compare the migrations folder's
  journal entries against the `__drizzle_migrations` table.)
- Reuses extracted `runMigrations(url)` (see Modules).

### `help`

Emit a manifest of all commands, their flags, and the exit-code table. `--json`
emits it as structured JSON; otherwise a readable listing. This is the
agent-discoverable surface.

## Agent-first ergonomics (cross-cutting)

- **Output mode auto-detects the caller.** Default to JSON when `process.stdout.isTTY`
  is false (piped / run by an agent), pretty when it is a TTY. `--json` / `--pretty`
  force a mode.
- **Stable envelopes** (documented, never reshaped between commands):
  - Success: `{ "ok": true, "command": "<name>", "result": { ... } }`
  - Failure: `{ "ok": false, "command": "<name>", "error": "<message>", "hint": "<actionable next step>" }`
- **Never blocks on a prompt.** Non-interactive by default. Missing required
  input (e.g. `--remote` without a password, or `migrate` without `POSTGRES_URL`)
  → immediate operation error naming the exact env var / flag. A password prompt
  is offered only under an explicit `--interactive` flag on a TTY.
- **No ANSI/color** when stdout is not a TTY.
- **`--verbose`** adds diagnostic detail (e.g. full stack traces); off by default.

## Architecture / modules

```
scripts/admin-cli.ts          # entry: parseArgs, output-mode detection, dispatch,
                              #   top-level error → envelope + exit code, help manifest
scripts/lib/admin-remote.ts   # remote client: login → capture queryme_admin cookie →
                              #   GET/POST /api/admin/persona-source; maps HTTP errors
lib/db/migrate.ts             # NEW: runMigrations(url) + listPendingMigrations(url),
                              #   extracted from scripts/migrate.ts (Neon-http vs pg routing)
```

- `scripts/migrate.ts` is refactored to call `runMigrations` from `lib/db/migrate.ts`
  so `pnpm db:migrate` keeps working and there is a single migration implementation.
- Local `sync`/`status` import the `lib/persona-source.ts` functions directly.
- Remote `sync`/`status` go through `admin-remote.ts`.
- `admin-cli.ts` loads `.env.local` via `process.loadEnvFile` (matching existing
  scripts) before reading env.

### Remote client (`admin-remote.ts`)

- `login(baseUrl, password): Promise<string>` — `POST {baseUrl}/api/admin/login`
  with `{ password }`; extract the `queryme_admin` value from `Set-Cookie`.
  Returns the cookie value or throws a typed error mapped from the response.
- `fetchStatus(baseUrl, cookie)` → `GET .../api/admin/persona-source`.
- `postSync(baseUrl, cookie, { repoUrl, branch })` → `POST .../api/admin/persona-source`.
- HTTP → error mapping (carried into the failure envelope's `error`/`hint`):
  - `401` → "incorrect admin password" / "check ADMIN_PASSWORD for the target instance"
  - `429` → "rate-limited by the admin login throttle" / "wait and retry"
  - `400` (sync) → surface the server `error` message (e.g. missing persona files)
  - network/other → the underlying message.

## Error handling & exit codes

(Documented in `help --json`.)

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | Operation error (sync failed, bad password, DB error, missing `POSTGRES_URL`, no active source for default sync) |
| 2 | Usage error (unknown command/flag, `migrate --remote`) |

- Local sync errors come from the existing typed `SyncResult` `{ kind:"error" }`
  and are printed plainly (no stack trace unless `--verbose`).
- Every error path emits the failure envelope to stdout (JSON mode) or a readable
  message (pretty mode) and sets the exit code.

## Testing

Uses the existing `vitest` + `msw` setup; no new infrastructure.

- **Arg parsing / dispatch** (unit): each subcommand parses correctly; flag combos;
  `migrate --remote` → usage error (exit 2); unknown command/flag → usage error;
  default-mode detection given a mocked `isTTY` true/false.
- **Output envelopes** (unit): success and failure envelopes have the stable shape;
  JSON vs pretty selection honors `--json`/`--pretty` and the `isTTY` default;
  no ANSI when non-TTY.
- **Remote client** (`msw`): mock `/api/admin/login` + `/api/admin/persona-source`;
  assert the `queryme_admin` cookie is captured from `Set-Cookie` and forwarded on
  the follow-up request; assert `401` / `429` / `400` map to the right `error`/`hint`
  and exit code; assert `--dry-run` never issues a `POST`.
- **Migration extraction** (unit): the Neon-http vs postgres-js URL routing is pure
  and unit-testable. Actual migration application needs a real DB and is left to
  manual / CI smoke, not unit tests.

## Out of scope (YAGNI)

- No on-disk session/cookie caching (re-login per invocation; avoids a secret on disk).
- No admin migrate HTTP endpoint.
- No bearer-token auth (reuses the password/login flow).
- No CLI framework dependency.
- No commands beyond sync / status / migrate / help.
