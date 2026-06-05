# Public per-account CV

**Date:** 2026-06-05
**Status:** Draft (pending review)

## Problem

The app is multi-tenant: each account has its own KB and a public page at
`/{username}` (and a custom domain, e.g. `alexcollet.com` → the `Miawousha`
account). But the CV is still wired to a single account:

- The printable CV is a **global route `/cv`** + data API `/api/cv`, both
  resolved via `resolveRootAccountId()` — the featured/house account only.
- The **in-panel CV** (button + synthetic KB entry + copy/download/print) is
  gated behind `isRootAccount`, and every `/{username}` page is rendered with
  `isRootAccount={false}`. So non-root accounts have **no CV at all**, and the
  client components hardcode `/api/cv` and `/cv`.
- Custom domains only rewrite `/` → `/{slug}`; `alexcollet.com/cv` falls through
  to the *root* account's CV, and `alexcollet.com/Miawousha/cv` 404s.

The owner's decision: the CV should be **public, per account** — every account
gets a CV scoped to its own KB, like everything else.

## Decisions (from brainstorming)

1. **Model:** public per-account CV (not owner-private). Each account exposes its
   own CV: in-panel + a standalone printable route.
2. **House URLs kept as thin wrappers.** `/cv` and `/api/cv` stay live and serve
   the featured/root account, delegating to the **same shared core** the
   per-account routes use. Non-breaking; one implementation; existing links,
   bookmarks, sitemap, and the About-popover link keep working.
3. **Custom domains expose the CV at `/cv`.** Middleware also rewrites `/cv` →
   `/{slug}/cv` for custom hosts (in addition to `/` → `/{slug}`), so the CV
   lives on the user's own domain.
4. **CV becomes available to every account; MCP stays root-only.** The
   `isRootAccount` gate is split: CV is ungated, MCP/`McpModal` remain gated.
5. **Privacy filter is the single chokepoint.** All CV surfaces flow through one
   loader that runs `filterKbForCv` (public-repos-only — already fixed and
   tested), so no surface can leak private repos by construction.

## Architecture: shared core + thin per-surface wrappers

Mirrors the existing multi-tenant pattern (`app/api/a/[username]/kb/route.ts`
and `app/api/kb/route.ts` both delegate to `handleKbManifest(accountId)`).

### Shared loader — `lib/cv/load.ts` (new)

```ts
export async function loadCvKb(
  accountId: string,
  lang: KbLang,
): Promise<{ root: string; cvKb: Kb } | null>;
```

- `getPersonaStore().ensureReady(accountId)` → `getRoot(accountId)`; `null` root
  ⇒ return `null` (callers render not-configured / 503).
- `Promise.all([loadKb(path.join(root,"kb"), lang), loadCvConfig(root)])` →
  `filterKbForCv(kb, config)`.
- Returns `root` too (the standalone page needs it for `loadPersona` →
  metadata).

This is the **only** place the CV KB is assembled, so the privacy filter runs
exactly once per surface and cannot be bypassed.

### Data API

- **Keep** `app/api/cv/route.ts` (root): `resolveRootAccountId()` → `loadCvKb` →
  JSON `{ lang, kb }` with the existing cache headers. Refactored to drop its
  inline kb/config/filter logic.
- **New** `app/api/a/[username]/cv/route.ts`: `loadAccountForSlug(username)`
  (→ 404 if missing) → `loadCvKb(account.id, lang)` → same JSON shape +
  headers. Mirrors `app/api/a/[username]/kb/route.ts`.

### Standalone printable page

- **Keep** `app/cv/page.tsx` (root) and **new** `app/[username]/cv/page.tsx`.
- Both render a shared `components/cv/cv-standalone.tsx` (today's `app/cv`
  markup: `CvTopBar` + `CvDocumentView` in the `max-w-3xl` wrapper, importing
  `print.css`), parameterized by an **account base** (`""` for root → `/cv`;
  `/{username}` otherwise) used for the top-bar back/lang/print links.
- `generateMetadata`: root via `resolveRootAccountId()`, per-account via
  `loadAccountForSlug`; both `loadPersona(root)` for `"{fullName} — CV"`.
- `app/cv/cv-top-bar.tsx` gains a `basePath` prop (today hardcodes
  `/cv?lang=…`).

### In-panel CV for every account

- `app/[username]/page.tsx`: keep `isRootAccount={false}` (MCP stays off for
  non-root) but pass the account's page base so the CV can be account-aware.
- `KbProvider`: `includeCv` becomes `true` for all accounts (today
  `includeCv={isRootAccount}`). Add a `cvPrintBase` field (the account base,
  `""` or `/{username}`) to the provider props + `KbContextValue`.
- `home-shell.tsx`: ungate `cvButtonLabel` / `onOpenCv` (remove the
  `isRootAccount ?` wrap); the `McpModal` block and `mcpButtonLabel`/`onOpenMcp`
  stay gated. The About-popover `cvHref` becomes `${cvPrintBase}/cv?lang=…`.
- `cv-document-client.tsx`: fetch `${apiBasePath}/cv?lang=…` (read
  `apiBasePath` from `useKb()`), not the hardcoded `/api/cv`.
- `cv-panel-view.tsx`: copy/download fetch `${apiBasePath}/cv`; `openPrintView`
  opens `${cvPrintBase}/cv?lang=…&print=1` (both from `useKb()`).

### Custom domains — `middleware.ts`

For a custom host (`!isPlatformHost`), in addition to `/` → `/{slug}`, also
rewrite `/cv` → `/{slug}/cv`. Resolution still uses `resolveCustomHost(host,
getDomainSlug)`; the namespaced `/api/a/{slug}/cv` continues to resolve by path
(API routes are excluded from middleware), so the in-panel CV on a custom-domain
root works unchanged.

### Sitemap — `app/sitemap.ts`

Keep `/`, `/about`, `/cv`. Per-account `/{username}` + `/{username}/cv`
enumeration is **optional** and only added if an account-list query already
exists; otherwise left as-is. Lowest priority, last.

## Data flow

```
Platform domain:
  /{username}        → AccountHome → HomePageClient(apiBasePath=/api/a/{username},
                       cvPrintBase=/{username}) → in-panel CV
                       → fetch /api/a/{username}/cv → loadCvKb(account.id)
  /{username}/cv     → CvStandalone → loadCvKb(account.id)   [print]
  /cv, /api/cv       → loadCvKb(rootAccountId)               [house wrappers]

Custom domain (alexcollet.com → Miawousha):
  /     → middleware rewrite → /Miawousha       (in-panel CV, apiBase=/api/a/Miawousha)
  /cv   → middleware rewrite → /Miawousha/cv    (print)
```

## Privacy

Every route resolves its KB through `loadCvKb` → `filterKbForCv`, which keeps
only repos that are `visibility === "public" && url`. Single chokepoint, already
covered by `tests/lib/kb/cv-config.test.ts`. (Out of scope but noted: the chat
context assembler `assemblePublicKbText` has a separate, broader leak of the
same class — tracked elsewhere.)

## Testing

- **Shared loader:** `loadCvKb` returns `null` for an unconfigured account;
  returns a `cvKb` whose repos are public-only (extends existing privacy tests).
- **Per-account API:** unknown slug → 404; known slug → scoped `cvKb` JSON.
- **Middleware:** `/cv` on a custom host rewrites to `/{slug}/cv`; on the
  platform host it does not.
- Existing CV/privacy and KB-route tests stay green.

## Out of scope (noted, not built)

- **Per-account project curation** — *enabled* automatically (each account loads
  its own `cv-config.yaml` via `loadCvKb`), but authoring the curation is
  content work in each content repo.
- **2-page print-stylesheet tuning** (`app/cv/print.css`) for accounts with many
  projects.
- **Full sitemap enumeration** of every account (optional item above).
- The `assemblePublicKbText` chat-context leak (separate task).
