# Headless persona — decoupling content from the queryme app

**Date:** 2026-05-28
**Status:** Spec, awaiting plan

## Why

Today every persona-coupled string lives inside the queryme repo: the system prompt, the entire KB tree under `kb/`, the curation config, and the literal "Alexandre" / pronouns scattered through `lib/language.ts`. To swap to a different person, a fork-and-edit pass touches ~50 files. We want the deployed app to be a generic shell whose active persona is loaded at runtime from an external public GitHub repo. Editing content becomes "edit a Markdown file in your CV repo, click Sync"; no app code touched.

## What the user gets

- A new admin tab — **Content** — where the active persona's GitHub repo URL is configured.
- Clicking **Sync** pulls the latest commit of that repo into the app's cache and the agent immediately starts serving the new content. The UI shell (chat layout, theme, navigation, MCP/about modals) is queryme-owned and never changes.
- The persona's identity (name, pronouns) flows from the repo's `persona.yaml`, so UI strings that mention the persona ("Send to Alexandre", "What's his most recent role?") adapt automatically when the persona changes — and remain byte-identical to today's strings when the persona is still Alex.
- A fresh deploy with no persona configured shows a small "not configured" placeholder for public visitors and returns 503 from chat/MCP endpoints. The admin Content tab is the only place that prompts for setup.

## Non-goals

- GitHub webhook auto-sync (manual button only this iteration).
- Multi-persona-per-deploy / multi-tenancy. One deploy hosts one persona at a time.
- Branch/tag pinning UI (sync always pulls latest of the configured branch).
- Theme/branding overrides from the persona repo (UI shell stays queryme's).
- A persona-repo scaffolding CLI.
- Maintaining the sensitive/unlock feature. **The sensitive-data path is deprecated as part of this work and removed, not relocated.**

---

## Architecture overview

**Approach:** swap the directory. The KB loader, manifest, assembler, prompt loader, and cv-config loader already take a directory path. The active persona is just "where on disk that directory lives." A new module `lib/persona-source.ts` fetches a GitHub repo's tarball, extracts it into a local cache, validates required files exist, atomically flips a symlink, and clears the in-memory KB cache. Existing loaders point at `getActivePersonaRoot()/kb` instead of `process.cwd()/kb`. Nothing in the loader layer changes shape.

This is deliberately the smallest possible refactor. A `ContentSource` abstraction (interface with `FileSystemSource` / `GitHubArchiveSource` implementations) was considered and rejected as YAGNI — there is no second content source on the roadmap, and the filesystem already is the abstraction.

---

## 1. Persona repo contract

The external repo's layout mirrors what queryme's loaders already expect. Required tree:

```
persona.yaml                       # identity (see schema below)
prompts/system.md                  # plain markdown, no template syntax
cv-config.yaml                     # CV curation (optional; default = include all)
kb/
  profile.yaml      + profile.fr.yaml
  public-contact.yaml + public-contact.fr.yaml
  skills.yaml       + skills.fr.yaml
  education.yaml    + education.fr.yaml
  experience/<slug>.md  (+ .fr.md)
  projects/<slug>.md    (+ .fr.md)
  talks/<slug>.md       (+ .fr.md)
  code/<slug>.md        (+ .fr.md)
  recommendations/<slug>.md (+ .fr.md)
```

No `kb/sensitive/` — the sensitive path is being deprecated.

### `persona.yaml` schema

Small. It exists only for what the UI shell renders that isn't already in the KB.

```yaml
id: alex-collet                    # kebab-case
fullName: "Alexandre Collet"
givenName: "Alexandre"
defaultLocale: en
i18n:
  en:
    possessive: "his"
    objectPronoun: "him"
    subjectPronoun: "he"
  fr:
    possessive: "son"
    objectPronoun: "le"
    subjectPronoun: "il"
    givenWithApostrophe: "d'Alexandre"   # liaison form
```

Validated with zod. Unknown locales rejected. Missing required fields rejected. `givenWithApostrophe` is FR-only.

### `prompts/system.md`

Plain markdown read verbatim. No `{{...}}` placeholders, no substitution. The persona author writes the name and pronouns into the prompt as literal text. (Today's prompt is already literal — there is nothing to template.)

### Required files for a valid sync

A sync rejects (with a clear error) if any of these are missing:

- `persona.yaml`
- `prompts/system.md`
- `kb/profile.yaml` and `kb/profile.fr.yaml`
- `kb/public-contact.yaml` and `kb/public-contact.fr.yaml`
- `kb/skills.yaml` and `kb/skills.fr.yaml`
- `kb/education.yaml` and `kb/education.fr.yaml`

Empty `kb/experience/`, `kb/projects/`, etc. are allowed (a persona may not have entries in every category). The assembler already handles empty sections.

---

## 2. Sync mechanism

### `lib/persona-source.ts`

```ts
export type SyncResult =
  | { kind: "ok"; commitSha: string; syncedAt: Date }
  | { kind: "error"; message: string };

export async function syncFromGitHub(
  repoUrl: string,
  branch?: string,        // default "main"
): Promise<SyncResult>;

export function getActivePersonaRoot(): string | null;
export async function ensurePersonaCacheReady(): Promise<void>;
export async function getActivePersonaSourceRow(): Promise<PersonaSourceRow | null>;
export async function listSyncHistory(limit?: number): Promise<PersonaSourceRow[]>;
```

`syncFromGitHub` flow:

1. Parse the URL into `<owner>/<name>`. Reject if not `https://github.com/<owner>/<name>` (no SSH URLs, no paths beyond the repo).
2. `GET https://api.github.com/repos/<owner>/<name>/commits/<branch>` to resolve the latest commit SHA. (Unauthenticated. 60 req/hr/IP — fine for one admin clicking Sync.)
3. `GET https://codeload.github.com/<owner>/<name>/tar.gz/<sha>` — one HTTP request for the entire repo.
4. Extract into `${PERSONA_CACHE_ROOT}/<sha>/` (default `/tmp/queryme/persona-cache/`, overridable via `PERSONA_CACHE_ROOT` env for tests).
5. Validate required files exist (see section 1). If missing → return `{ kind: "error" }`, leave symlink untouched, write a row with `status: "error"`.
6. Atomically flip the symlink: write `${PERSONA_CACHE_ROOT}/current.new` → `<sha>/`, then `rename current.new → current`. (POSIX rename is atomic.)
7. Insert a `persona_source` row with `status: "ok"` and the new SHA.
8. Call `resetKbCache()` (new export from `lib/kb/cache.ts`) and `_resetPromptCache()` (new export from `lib/prompts.ts`) and the persona cache reset so the next request rebuilds.
9. Delete cache dirs older than the previous-2 SHAs (keep 2 most recent in case of rollback).

A process-local mutex (a `Promise` chained reference) serializes concurrent calls so two simultaneous Sync clicks don't corrupt the cache.

### Cold-start cache miss

On Vercel / serverless, `/tmp` is per-container and lost on cold starts. The lazy re-fetch is handled at the **request boundary**, not inside the sync getter:

```ts
// Sync. Returns the symlink target if present, else null. Never does I/O.
export function getActivePersonaRoot(): string | null;

// Async. Call once at the top of every server component / route handler
// that needs persona content. If the symlink is missing but a persona_source
// row with status="ok" exists, re-fetches that SHA's tarball into the cache
// and re-creates the symlink. Returns when the cache is ready or there is
// no active source.
export async function ensurePersonaCacheReady(): Promise<void>;
```

The re-fetch uses the **recorded SHA** (not the latest commit) for determinism — you get the exact bytes the active row references. ~200–500 ms one-time cost on cold-start requests; zero cost on warm requests.

Loaders (`lib/kb/cache.ts`, `lib/prompts.ts`, etc.) stay synchronous. The request handler awaits `ensurePersonaCacheReady()` before invoking any loader. If the persona is not configured at all (no row), the getter returns `null` and the handler renders the setup screen / returns 503.

### Concurrent syncs

Single-admin scenario. A simple in-process mutex:

```ts
let inFlight: Promise<SyncResult> | null = null;
export async function syncFromGitHub(...): Promise<SyncResult> {
  if (inFlight) return inFlight;
  inFlight = doSync(...).finally(() => { inFlight = null; });
  return inFlight;
}
```

---

## 3. Active root resolution & first boot

Every server-side reader that today does `path.resolve(process.cwd(), "kb")` switches to `path.join(getActivePersonaRoot(), "kb")`. Same for `prompts/system.md`, `cv-config.yaml`, and the new `persona.yaml`.

If `getActivePersonaRoot()` returns `null`:

- Public routes (`/`, `/cv`, `/about`) render a single-sentence "this deployment has no persona configured yet" page. Returns 503. No mention of the admin path.
- `/api/chat` returns 503 with `{ error: "persona_not_configured" }`.
- `/mcp` returns 503 with the equivalent JSON-RPC error.
- `/admin/login` works normally. After login, the dashboard opens directly on the Content tab with an empty-state prompt: "Paste a public GitHub repo URL."

After the first successful sync, all routes work normally on the next request.

---

## 4. DB additions

### New table `persona_source`

```sql
CREATE TABLE persona_source (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_url    text NOT NULL,
  branch      text NOT NULL DEFAULT 'main',
  commit_sha  text NOT NULL,
  synced_at   timestamptz NOT NULL DEFAULT now(),
  status      text NOT NULL,
  error       text
);
CREATE INDEX persona_source_synced_at_idx ON persona_source (synced_at DESC);
```

"Active" = the most recent row with `status = 'ok'`. Older rows persist for the Sync history view. Failed-sync rows persist too (with `status='error'` and the message) so the admin can see what went wrong.

### Drop the sensitive-unlock column on `askers`

The `askers.sensitive_unlocked_at` column (and any dependent indexes) is dropped in a separate migration.

### Rename `questions_for_alex` → `forwarded_questions`

Persona-coupling in the schema goes away in the same migration set. `lib/db/schema.ts` exports `forwardedQuestions` (renamed from `questionsForAlex`) and type `ForwardedQuestion`.

---

## 5. Admin "Content" tab

A new tab alongside Interviewers / Conversations / Questions / Analytics. Three panels:

**Current source** — repo URL (linked to GitHub), branch, active commit SHA (linked to commit page), last-synced timestamp, status badge. If `status='error'`, the error message displays inline.

**Actions** — "Update source" form (URL input, branch input defaulting to `main`, Sync button). "Resync from current source" button (same URL+branch, just refresh).

**Sync history** — collapsed by default. Last 10 syncs: timestamp, SHA (linked), status, error if any.

### API endpoints

- `GET /api/admin/persona-source` — returns `{ active: PersonaSourceRow | null, history: PersonaSourceRow[] }`. Admin-auth-required.
- `POST /api/admin/persona-source` — body `{ repoUrl, branch? }`. Triggers `syncFromGitHub`. Returns the new row on success, or `{ error }` with HTTP 400/500 on failure. Admin-auth-required.

Both endpoints reuse the existing `isAdminAuthenticated` gate.

---

## 6. UI strings that mention the persona

`lib/language.ts` currently exports `UI_STRINGS = { en: {...}, fr: {...} } as const` — a static build-time constant imported directly by client components.

**Refactor:** convert to a pure function `buildUiStrings(persona: Persona): UiStrings`. The 9 EN + 9 FR persona-mentioning strings consume `persona.i18n.<locale>` tokens:

| String | Becomes |
|---|---|
| `"What's his most recent role?"` | `` `What's ${en.possessive} most recent role?` `` |
| `"How do I contact him?"` | `` `How do I contact ${en.objectPronoun}?` `` |
| `"Send this question to Alexandre"` | `` `Send this question to ${persona.givenName}` `` |
| `"Sent. Alexandre will see it next time he checks."` | `` `Sent. ${persona.givenName} will see it next time ${en.subjectPronoun} checks.` `` |
| `"Comment le contacter ?"` | `` `Comment ${fr.objectPronoun} contacter ?` `` |
| `"...projets d'Alexandre. Posez-moi..."` | `` `...projets ${fr.givenWithApostrophe}. Posez-moi...` `` |
| (etc. — 9 EN + 9 FR strings total) | |

**Byte-identity for Alex:** with the Alex `persona.yaml` (`givenName: "Alexandre"`, `possessive: "his"`, etc.), every rendered string is character-for-character equal to today's literal. Verified by the golden-master test (section 10).

### Server / client boundary

Today `app/page.tsx`, `components/home-shell.tsx`, and `components/kb/kb-context.tsx` are `"use client"` and import `UI_STRINGS` directly. After the refactor:

- `app/page.tsx` becomes a **server component**. It loads the persona, calls `buildUiStrings(persona)`, and renders a new thin client wrapper that owns the React state (`lang`, `mcpOpen`, etc.) — the wrapper receives the two prebuilt locale string tables as props.
- `home-shell.tsx` receives `t: UiStrings` as a prop instead of importing.
- `kb-context.tsx` receives `kbStrings: KbStrings` as a prop and passes it via context as today.

Page metadata (`app/layout.tsx`, `app/about/page.tsx`, `app/cv/page.tsx`) switches from static `export const metadata` to `export async function generateMetadata()` so titles can read the persona at request time.

---

## 7. Failure modes (consolidated)

| Failure | Behaviour |
|---|---|
| GitHub network / 5xx / rate limit | Sync returns error; previous SHA stays active; admin sees message. |
| Tarball corrupt | Same — caught at extract step. |
| Required file missing | Same — caught at validation step. |
| Schema validation fails (`persona.yaml` etc.) | Same. |
| `[ref: ...]` paths in assembled KB don't resolve | Same; assembler-level validation. |
| Cold start / `/tmp` empty | Lazy re-fetch on first request; one-time ~200–500ms cost. |
| In-memory KB cache after sync | `resetKbCache()` + `_resetPromptCache()` called by sync handler. |
| Two simultaneous Sync clicks | Process-local mutex serializes them. |
| Disk fills with old SHAs | Cleanup of dirs older than previous-2 after each successful sync. |
| Admin pastes URL not under github.com | URL parser rejects; no fetch attempted. |

---

## 8. Code-change inventory

### New files (6)

- `lib/persona-source.ts` — fetch / extract / validate / symlink / mutex.
- `lib/persona.ts` — load + validate `persona.yaml`; server-only; cached.
- `app/api/admin/persona-source/route.ts` — `GET` + `POST` endpoints.
- `components/admin/content-tab.tsx` — the new admin UI.
- (Empty-state rendering folded into `app/page.tsx`; no new route needed.)
- `lib/db/migrations/0005_persona_source.sql` (+ companion drizzle generated files).
- `lib/db/migrations/0006_drop_sensitive_unlock.sql`.
- `lib/db/migrations/0007_rename_questions_table.sql`.

### Modified (~10)

- `lib/kb/cache.ts` — read root from `getActivePersonaRoot()`; export `resetKbCache()`.
- `lib/prompts.ts` — read `prompts/system.md` from active root; export `_resetPromptCache()`.
- `lib/kb/cv-config.ts` — config path from active root.
- `lib/kb/loader.ts` — only if the loader hard-codes the `kb` subdir (already takes a path; verify).
- `lib/language.ts` — convert `UI_STRINGS` const to `buildUiStrings(persona)`.
- `app/page.tsx` — convert to server component; load persona + build strings; render new client wrapper.
- `components/home-shell.tsx` — accept `t: UiStrings` prop instead of importing.
- `components/kb/kb-context.tsx` — accept `kbStrings` prop.
- `app/layout.tsx`, `app/about/page.tsx`, `app/cv/page.tsx` — `metadata` → `generateMetadata()`.
- `components/admin/admin-dashboard.tsx` — add the Content tab.
- `lib/db/schema.ts` — rename `questionsForAlex` → `forwardedQuestions`; drop the sensitive column; add `personaSource` table.
- `lib/admin/data.ts`, `lib/questions/repo.ts`, `app/api/admin/analytics/route.ts`, `components/admin/admin-dashboard.tsx` — propagate the rename.
- `lib/kb/manifest.ts` — drop `EXCLUDED_DIR = "sensitive"`.

### Deleted

- `kb/` (entire tree moves to external repo).
- `prompts/system.md` (moves to external repo).
- `cv-config.yaml` at repo root (moves to external repo).
- `kb/sensitive/` (deprecated entirely; not migrated).

---

## 9. Migration plan (ordered, one-time)

1. **Create the external content repo** locally (`queryme-content-alex/`). Copy `kb/` → `queryme-content-alex/kb/`, `prompts/system.md` → `queryme-content-alex/prompts/system.md`, `cv-config.yaml` → `queryme-content-alex/cv-config.yaml`. Write a fresh `persona.yaml`. **Delete `kb/sensitive/` — not migrated.** Push to public GitHub.
2. **Capture the golden-master prompt** from current main: serialize today's `buildSystemPromptParts({kbText: assemblePublicKbText(await loadKb("kb"))})` concatenated string to `tests/fixtures/prompt-golden-pre-migration.txt`.
3. **Build the refactor on a branch** — new tables, new code paths, refactored loaders.
4. **Drizzle migration `0005_persona_source`** — create the new table.
5. **Drizzle migration `0006_drop_sensitive_unlock`** — drop the `askers.sensitive_unlocked_at` column and any orphan indexes/policies.
6. **Drizzle migration `0007_rename_questions_table`** — `ALTER TABLE questions_for_alex RENAME TO forwarded_questions;` plus rename FK constraint names. Update `lib/db/schema.ts` and all import sites.
7. **Delete** `kb/`, `prompts/system.md`, `cv-config.yaml` from the queryme repo.
8. **Deploy** the branch to a staging environment (or feature-flag if a staging DB exists). Confirm the setup screen renders for a fresh database.
9. **Log into admin** → Content tab → paste `https://github.com/<owner>/queryme-content-alex` → Sync.
10. **Verify byte-identity** via the golden-master test (section 10). Must match `tests/fixtures/prompt-golden-pre-migration.txt` exactly.
11. **Merge to main, deploy to production**, sync once on production.

If step 10 fails, do not merge — diagnose the diff first.

---

## 10. Testing strategy

### New tests

- `tests/lib/persona-source.test.ts` — MSW mocks `api.github.com` and `codeload.github.com`. Cases: happy path; missing required file; corrupt archive; network error; concurrent calls serialize; cleanup of old SHAs.
- `tests/lib/persona.test.ts` — zod validation of `persona.yaml`: missing `givenName`, unknown locale, etc.
- `tests/prompts/golden-master.test.ts` — sets `PERSONA_CACHE_ROOT` to a fixture dir, builds the full prompt, asserts equality with `tests/fixtures/prompt-golden-pre-migration.txt`.
- `tests/api/admin/persona-source.test.ts` — admin auth required; happy `POST`; failure preserves prior row; concurrent `POST` serializes.
- `tests/components/admin/content-tab.test.tsx` — history rendering, error display, URL submission.
- `tests/app/empty-state.test.tsx` — `getActivePersonaRoot() === null` renders the setup screen; chat / MCP return 503.

### Modified tests

- Existing tests that hardcode "Alexandre" / "Alex" strings load a test persona fixture instead. (`tests/components/chat-message.test.tsx`, `tests/app/about/page.test.tsx`, `tests/lib/notify/email.test.ts`.)
- `tests/prompts/system-contract.test.ts` — `PROMPT_PATH` now resolves via `getActivePersonaRoot()` pointed at a fixture.
- `tests/lib/admin/data.test.ts` — type rename `QuestionForAlex` → `ForwardedQuestion`.

### Removed tests

- Anything asserting `EXCLUDED_DIR === "sensitive"` in `tests/lib/kb/manifest.test.ts`.
- The `kb/sensitive/` traversal-prevention test in `tests/lib/kb/tools.test.ts` (the path traversal protection itself stays — but it no longer needs to specifically reference `sensitive/`).

---

## 11. Open questions (none expected to block implementation)

None at spec time. If any of the following surface during implementation, they can be resolved on the plan without re-opening the spec:

- Exact tarball-extraction library (`tar` npm package vs. shelling out to `tar`). Node's stdlib doesn't include tar extraction; the `tar` npm package is the well-trodden path.
- Exact symlink fallback for filesystems without symlink support (none expected on Linux/macOS dev or Vercel/Fly; document but don't implement).
- Whether to expose the active persona's `commit_sha` to the public footer (transparency vs. clutter). Defer to a separate UX decision.
