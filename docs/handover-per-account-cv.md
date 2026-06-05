# Handover — make the CV per-account (and fix a live privacy regression)

**Date:** 2026-06-05
**For:** a fresh session picking this up. Assume no memory of the conversation that produced this file.
**Repo:** `/Users/alexandrecollet/queryme` (app), content repo at `/Users/alexandrecollet/queryme-content-alex`.

---

## TL;DR

The app became multi-tenant — each account has its own KB and a public page at `/[username]` (custom domains too, e.g. `alexcollet.com` → the `Miawousha` account). But the **printable CV is still a single global route `/cv` hard-wired to the root account**. It needs to become **individual per account**, like everything else.

Owner's framing: **"the CV is for the user, not a public route."** → The first thing to decide (brainstorm) is whether the CV should be:
- **(a) a per-account *public* page** at `/[username]/cv` (scoped to that account's KB), or
- **(b) an owner-*private* feature** (behind auth, e.g. in `/[username]/admin/...`) that only the account owner can view/print.

The phrase "not a public route" leans toward (b), but confirm with the owner.

## ⚠️ Do this first — live privacy regression on `/cv`

Independent of the redesign, **the current public `/cv` is leaking private repos right now** (`https://www.alexcollet.com/cv`). A recent migration (`code` → `projects`, see below) dropped the CV's "public repos only" filter. The CV now lists **all 51 repos including the 44 private ones** (names + one-line descriptions, with dead links to private GitHub repos), plus all 14 projects — so it ballooned from ~2 pages and exposes private repo info publicly.

**Root cause + fix (small, can ship before the redesign):**
- `lib/kb/cv-config.ts` → `filterKbForCv()` used to filter the old top-level `code` array to `visibility === "public" && url`. That filter was removed when `code` was merged into `projects`. It now passes projects through untouched, and the CV reads repos via `allRepos(kb)` ([lib/kb/repos.ts](../lib/kb/repos.ts)) with **no filter**.
- Fix: in `filterKbForCv`, trim each project's `frontmatter.repos` to public-with-url for the CV, e.g.:
  ```ts
  projects: whitelist(config.projects, kb.projects, (p) => p.slug, "projects").map((p) => ({
    ...p,
    frontmatter: {
      ...p.frontmatter,
      repos: (p.frontmatter.repos ?? []).filter((r) => r.visibility === "public" && r.url),
    },
  })),
  ```
  Then `allRepos(cvKb)` yields only public repos (~7). Add a test in `tests/lib/kb/cv-config.test.ts` asserting private repos are dropped from a project's `repos` after `filterKbForCv`.
- This flows to BOTH CV surfaces (the page and the copy/download markdown) because both consume the filtered `cvKb` (`app/cv/page.tsx` and `app/api/cv/route.ts` both call `filterKbForCv`).
- **Deploy:** app code change → push `main` → Vercel redeploys (no content/Resync needed for this fix).

## How the CV works today (current architecture)

- **Route:** `app/cv/page.tsx` — resolves the account with `resolveRootAccountId()` ([lib/accounts/root.ts](../lib/accounts/root.ts)), loads `kb` + `cv-config.yaml`, calls `filterKbForCv`, renders `<CvDocumentView>`. **Single global route, root account only.**
- **Data API:** `app/api/cv/route.ts` — same root-account pattern; returns the filtered `cvKb` JSON (used by the client doc + copy/download).
- **Components:** `components/cv/cv-document.tsx` (server-rendered doc; computes `repos = allRepos(kb)`), `cv-document-client.tsx` (client, fetches `/api/cv`), `cv-panel-view.tsx` (the in-panel CV with copy/download/print; print opens `/cv?lang=…&print=1`). Strings in `lib/cv/strings.ts` (`CV_STRINGS`, section label `code` = "Open source").
- **Linked from:** `components/home-shell.tsx` (`cvHref={/cv?lang=…}`) and the KB panel's print action. The `/[username]` page (`app/[username]/page.tsx`) has **no CV link**.
- **Sitemap:** `app/sitemap.ts` lists `${SITE}/cv`.
- **Custom domains:** `middleware.ts` rewrites only the **root path** `/` of a custom host to that host's account page. Other paths (like `/cv`) fall through to the normal routes — which is why `alexcollet.com/cv` currently serves the **root account's** CV, and `alexcollet.com/Miawousha/cv` 404s (no `/[username]/cv` route exists).

## Multi-tenant resolution pattern to replicate

`app/[username]/page.tsx` is the template for per-account routes:
```ts
const { username } = await params;
const account = await loadAccountForSlug(username);   // lib/accounts/load.ts → resolveAccountSlug (lib/accounts/repo.ts)
if (!account) notFound();
const store = getPersonaStore();
await store.ensureReady(account.id);
const root = store.getRoot(account.id);               // that account's KB root
// per-account API base: `/api/a/${account.username}`  (see app/api/a/[username]/*)
```
So a per-account CV would use `loadAccountForSlug(username)` instead of `resolveRootAccountId()`, and a per-account CV data API would live under `app/api/a/[username]/cv/route.ts` (mirroring the existing `/api/a/[username]/*` routes).

## Proposed scope (for the new session to brainstorm → spec → plan)

1. **Decide the model** (the (a) public-per-account vs (b) owner-private question above) — this gates everything. Ask the owner.
2. If **(a) public per-account:** add `app/[username]/cv/page.tsx` + `app/api/a/[username]/cv/route.ts` scoped to the account; add a CV link on `app/[username]/page.tsx`; decide the fate of the global `/cv` (keep for the root/custom-domain account, redirect, or remove) and how custom domains expose it (`alexcollet.com/cv` → the domain's account CV — likely a middleware rewrite, since middleware currently only handles `/`).
3. If **(b) owner-private:** move the CV under `/[username]/admin/...` (auth-gated via the existing admin guard, see `lib/admin/require-admin.ts` / `app/[username]/admin/resolve.ts`); remove/redirect the public `/cv`; drop it from the sitemap.
4. **Fold in the privacy fix** (above) regardless — though if (b) is chosen and the CV is no longer public, the public-leak urgency drops (but still fix the filter for correctness, and note the global `/cv` is live until the redesign ships).
5. **Re-tighten to ~2 pages:** with 14 projects now (was 1), consider per-account project curation via `cv-config.yaml` (`projects: include: […]`) and/or revisit the print stylesheet.
6. **Decommission the global `/cv`** once the per-account route exists (update `home-shell` cvHref, sitemap, print action, any links).

## Relevant recent context (so the data model makes sense)

A just-completed migration merged the KB's `code` category into `projects` (shipped to `main` and live; content repo migrated to `Miawousha/queryme-content-alex`). Implications for the CV work:
- Repos are no longer a top-level `kb/code/` category. A **project** carries an optional `repos:` array (`RepoSchema` in [lib/kb/schemas.ts](../lib/kb/schemas.ts)): `name, role, url, visibility (public|private), description, language, year, last_active, stars, archived, stack, tags`. No `code_bytes`.
- `allRepos(kb)` ([lib/kb/repos.ts](../lib/kb/repos.ts)) flattens every project's repos (CV-only helper; node-free so client-safe).
- Specs/plans for that migration: `docs/superpowers/specs/2026-06-04-merge-code-into-projects-design.md`, `…/content-repo-migration-design.md`, and the matching plans under `docs/superpowers/plans/`.
- Content repo facts: 14 projects, 51 repos (7 public / 44 private), bilingual (`.md` + `.fr.md`). The 44 private repos are the ones currently leaking onto the public CV.

## Quick checks for the new session
- Live (root) CV: `https://www.alexcollet.com/cv` (currently bloated + leaking private repos).
- 404 (expected — route doesn't exist): `https://www.alexcollet.com/Miawousha/cv`.
- `git log --oneline -15` on `main` shows the migration + cleanup commits for context.

## Suggested entry point
Start with the **brainstorming** skill on the (a)-vs-(b) decision, then spec → plan → implement. Ship the **privacy filter fix** early (it's small and the leak is live), even ahead of the full per-account redesign.
