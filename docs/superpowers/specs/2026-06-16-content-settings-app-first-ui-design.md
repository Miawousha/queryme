# Content settings — App-first UI pass

**Date:** 2026-06-16
**Status:** Approved (IA), pending spec review

## Context & motivation

The Queritae GitHub App (slug `queritae`) is now live and is the primary
auto-sync path: installing it on a single repo identity-maps the account, stores
the `installation_id`, and auto-syncs on install and on every push via the
single app-level webhook `POST /api/github/app`.

The Content settings page (`app/[username]/admin/settings/content/page.tsx`,
rendering `ContentTab` + `AutoSyncPanel`) still presents the legacy paths — a
manual repo-URL "Update source" form and a manual per-repo webhook — with equal
prominence. Worse, `AutoSyncPanel` shows the manual webhook (Payload URL +
secret + setup steps) **even when the account is already connected via the
App**, because that block is gated only on `enabled && secret`, not on
`!connectedViaApp` (`components/admin/auto-sync-panel.tsx:99`). Following those
instructions while App-connected would create a second, redundant delivery path
(a duplicate sync on every push).

This pass reorganizes the page so the App is the spine and the manual paths
become a clearly-labeled, collapsed fallback.

## Goals

- App-connected accounts see a clean status and **never** the manual webhook inline.
- The manual repo-URL form and the manual webhook live under one collapsed
  "Advanced (manual setup)" disclosure, shown only to people not using the App.
- The empty-state onboarding makes **Connect with GitHub App** the primary CTA
  after the user builds their content repo.
- No regression for legacy manual-webhook accounts, and a graceful fallback when
  the App env vars are unset (`appInstallUrl === null`, e.g. preview deploys).

## Non-goals

- No change to the webhook backend, sync logic, or DB schema.
- Not removing the manual webhook path — it stays as a fallback.
- No private-repo support; no org-account manage-URL polish (noted as future).
- Not fixing the known post-install "Connect until refresh" race (separate item).

## Files in scope

- `components/admin/auto-sync-panel.tsx` — restructure (status block + Advanced disclosure).
- `components/admin/content-tab.tsx` — move the manual "Update source" form into Advanced; wire the empty state.
- `components/admin/kb-setup-steps.tsx` — add step 2 "Connect with GitHub App".
- `app/[username]/admin/settings/content/page.tsx` — compute `appInstallUrl()` server-side and pass it to `ContentTab`/`KbSetupSteps`.
- `app/api/a/[username]/admin/auto-sync/route.ts` — add a derived `manageUrl` to the view.
- Tests: extend `tests/components/admin/{auto-sync-panel,content-tab,kb-setup-steps}.test.tsx` and `tests/app/api/a/admin-auto-sync.test.ts`.

## Information architecture

Two axes drive the display: whether an **active source** exists, and the
**auto-sync status** (`connectedViaApp` × `enabled`).

### Auto-sync status block (`AutoSyncPanel`)

| `connectedViaApp` | `enabled` | Top-level display |
|---|---|---|
| true | true | "● Connected via GitHub App — every push to this repo syncs automatically." + last delivery + `[Manage on GitHub ↗]` `[Disable]`. Manual webhook hidden (under Advanced). |
| true | false | "○ Connected via GitHub App — paused." + `[Enable]` `[Manage on GitHub ↗]`. |
| false | — | `[Connect with GitHub App (recommended)]` CTA (when `appInstallUrl` set) + caption. The existing `[Enable]`/`[Disable]` toggle for the manual path remains. Manual webhook under Advanced. |

**Fallback — `appInstallUrl === null`** (App env not configured): no App block at
all; the manual webhook renders **inline** exactly as today (it is the only
mechanism, so it must not be buried). This preserves current behavior for
preview/unconfigured environments.

Rule: the manual webhook details (Payload URL, Secret, steps, gh command,
Regenerate secret) render inline **only** in the `appInstallUrl === null`
fallback. Whenever an App install URL exists, they live under Advanced.

### Advanced disclosure

A collapsed native `<details>`:

- `AutoSyncPanel` → "Advanced: manual webhook" — the Payload URL, Secret, the 3
  setup steps, Copy gh command, Regenerate secret, and last delivery. Always
  reachable so a legacy manual-webhook user can still retrieve their secret.
  Meaningful only when `enabled && secret`.
- `ContentTab` → "Advanced: change source manually" — the repo-URL + branch +
  Sync form, used to point at a different repo/branch.

These are two separate `<details>` (one per component) rather than a single
page-level section, because the two components fetch independent data
(`/auto-sync` vs `/persona-source`) and unifying them would require hoisting
both fetches into the page. The page renders `ContentTab` then `AutoSyncPanel`,
so the two Advanced disclosures sit adjacent and read as one area. Distinct,
honest labels avoid two identically-named toggles. (A future refactor could
unify them into one page-level "Advanced" section — out of scope here.)

### `ContentTab`

- **Active source** block (repo/branch/commit/last synced + Resync) — unchanged, stays at top.
- **Manual "Update source" form** → moved into the "Advanced: change source manually" `<details>`. App users get their source from the install; manual change is a fallback.
- **Sync history** — unchanged, stays visible (useful at a glance).
- **Empty state** (no active source) → renders `KbSetupSteps` (see below).

### `KbSetupSteps` (empty state)

Becomes a 2-step flow:

1. **Build your content repo** — copy the agent prompt (unchanged) / read the setup guide.
2. **Connect it** —
   - Primary CTA: **Connect with GitHub App** → `appInstallUrl` (passed as a prop).
   - Caption: one click installs auto-sync and syncs the repo automatically.
   - Disclosure: "or paste the repo URL manually" → reveals the repo-URL + branch
     + Sync form (posts to the same `/persona-source` endpoint).
   - When `appInstallUrl === null`: the manual paste form is the primary affordance (no App CTA).

The manual paste form is therefore reachable from the empty state (step 2
disclosure) and, once a source exists, from "Advanced: change source manually".
Implementation should extract the manual sync form so it can be rendered in both
places without duplicating the submit logic.

## API change

In `app/api/a/[username]/admin/auto-sync/route.ts`, extend `view()` with:

```ts
manageUrl: config?.installationId
  ? `https://github.com/settings/installations/${config.installationId}`
  : null,
```

`[Manage on GitHub]` links to `manageUrl`. The raw `installationId` is not
exposed — only the derived URL — keeping the API surface minimal. This is the
personal-account installation-settings path; org installs use a different URL.
Acceptable for v1 (owner account is personal); deriving the org path is future
work.

## Disable semantics (decided)

`Disable` stays a **soft local pause**: it sets `enabled = false`; the App stays
installed; push deliveries still arrive but skip because `!config.enabled`
(`app/api/github/app/route.ts:89`). `Enable` flips it back on. To actually
change repo access or uninstall, the user uses `Manage on GitHub`.

## Edge cases

- `appInstallUrl === null` — no App block; manual webhook + manual paste shown inline (current behavior). Empty state shows manual paste as primary.
- `connectedViaApp && !active source` (install race / multi-repo install where no single repo was auto-synced) — show "Connected via GitHub App — finishing first sync" rather than "not configured"; no manual webhook; Advanced still available.
- `connectedViaApp && !enabled` — "paused" copy + Enable.

## Testing

Extend the existing vitest + React Testing Library suites (fetch stubbed with the
view JSON, per the current pattern):

- `auto-sync-panel.test.tsx`
  - connected + enabled → "Connected via GitHub App", `Disable` + `Manage on GitHub` link (href = `manageUrl`); the secret is **not** rendered at top level (it lives inside the collapsed `<details>`).
  - connected + disabled → "paused" + `Enable`.
  - not connected + `appInstallUrl` → primary Connect CTA; manual webhook under Advanced (collapsed).
  - not connected + no `appInstallUrl` → manual webhook inline (current behavior), no App block.
  - update the existing "shows connected status" test to also assert the secret is no longer inline.
- `content-tab.test.tsx` — empty state renders `KbSetupSteps` with the Connect CTA; active-source state exposes "change source" only under Advanced.
- `kb-setup-steps.test.tsx` — renders the Connect CTA when `appInstallUrl` is provided; manual-paste disclosure present; falls back to manual paste when `appInstallUrl` is null.
- `admin-auto-sync.test.ts` — view includes `manageUrl` when `installationId` is set, `null` otherwise.

## Out of scope / future

- Unifying the two Advanced disclosures into one page-level section.
- Org-account `manageUrl`.
- Fixing the post-install "Connect until manual refresh" race.
- Private-repo support.
