# CV House-Style Template + Modal — Design

**Date:** 2026-06-19
**Status:** Approved for planning

## Problem

The CV today is a structured projection of the KB rendered by a clean-but-plain
component ([`CvDocumentView`](../../../components/cv/cv-document.tsx)). It is reached
through a small, easily-missed icon in the top-bar cluster, and it opens *inside the
KB side panel* (with a fullscreen "focus mode"). We want:

1. A **spectacular, perfected house-style** CV — design quality, not just correctness.
2. A **prominent** entry point on the main page.
3. The CV to open in a **dedicated modal** with **Download · Share · Print** tools.
4. The CV to remain **printable**.

## Decisions (settled during brainstorming)

- **Content ownership — keep structured collections.** The CV stays a *projection* of
  the existing KB collections (`kb/profile.yaml`, `kb/experience/*.md`, …) via
  `loadCvKb` → `toResumeKb` → `filterKbForCv`. We are **not** moving to a user-authored
  CV artifact file. Rationale: a single perfected template needs predictable structured
  slots; freeform markdown can't fill them. The agent already reads raw `kb/` markdown
  directly, so the CV projection is presentation-only — nothing downstream breaks.
- **Design ownership — one app-owned house style.** Not multiple templates, not
  user-supplied templates. The "spectacular" lives in the renderer we perfect.
- **PDF — start with print CSS (path A).** No server-side render now. "Save as PDF"
  goes through the browser print path with a perfected A4 stylesheet. A server-side
  Chromium render (path B) is an explicit **fast-follow, out of scope here**; because it
  reuses the same template, the A→B move is cheap.
- **Privacy invariant preserved.** `filterKbForCv` (public-repos-only) continues to run
  exactly once in `loadCvKb`; this design does not touch it.
- **Consolidate to one in-app CV surface.** Retire the in-panel CV view; the modal is
  the single in-app surface. The standalone `/cv` and `/{username}/cv` pages stay (they
  are the shareable / printable canonical URLs the modal's Share/Print point at).

## Architecture

The CV data pipeline is unchanged. All work is in the **presentation + entry-point**
layer.

```
            (unchanged)                         (this design)
kb/ collections ─► loadCvKb ─► /api/.../cv ─► CvDocumentClient ─► CvDocumentView
                   (filter)      (JSON)         (fetch)            (HOUSE STYLE)
                                                   │
                                   ┌───────────────┴───────────────┐
                              CvModal (in-app)            /cv standalone page
                          [Download·Share·Print]        (share/print canonical URL)
```

### 1. House-style template (the core — design-heavy)

Rewrite [`CvDocumentView`](../../../components/cv/cv-document.tsx) and
[`print.css`](../../../components/cv/print.css) into the one perfected house style.

- Renders the structured `Kb` into designed slots (header/identity, experience,
  education, skills, projects, talks, open-source) — same data contract as today.
- **A4 print-first.** `@page` size/margins, `break-inside: avoid` on entries,
  `print-color-adjust: exact` for any color fills, embedded/`@font-face` fonts so the
  printed output matches the screen.
- Uses the app design tokens (`var(--color-*)`, `font-display`, `font-mono`) so it is
  of-a-piece with the shell and respects light/dark.
- One template renders in **all three** mount points (modal, `/cv` page, print) — no
  divergence.
- This is iterative visual craft: the implementation plan should expect to iterate in
  the browser preview against real KB content, not land it in one shot.

### 2. CvModal component

New `components/cv/cv-modal.tsx`. Mirrors the existing modal patterns
([`McpModal`](../../../components/mcp-modal.tsx),
[`AboutPopover`](../../../components/about-popover.tsx)) and reuses the `useDialog`
hook (focus-trap + Esc) already used by the panel's focus mode.

- Mounts [`CvDocumentClient`](../../../components/cv/cv-document-client.tsx), which
  fetches `/api/.../cv?lang=` — exactly as the panel does today.
- Chrome: title, language toggle, a toolbar (Download · Share · Print), close button,
  scrollable body sized to show the A4 document.
- Mounted in [`HomeShell`](../../../components/home-shell.tsx) alongside `McpModal` /
  `AboutPopover`. Open state is local `useState` in `HomeShell` (`cvOpen`) — the only
  trigger is the top-bar button, so no need to lift it to the page.

### 3. Prominent CV button

Promote the top-bar CV control in [`AppTopBar`](../../../components/app-top-bar.tsx)
from a bare 14px icon (`ICON_BTN`) to a **labeled accent pill** ("CV" + icon), visually
distinct from the surrounding icon cluster. `onOpenCv` now opens the modal (sets
`cvOpen`) instead of expanding the panel + `openFile(CV_VIRTUAL_PATH)`.

### 4. Modal toolbar actions

Honest mapping under path A (print-CSS, no server PDF yet):

- **Print** → `window.print()` from the modal (or open `/cv?lang&print=1`). Satisfies
  the "printable" requirement and is the de-facto PDF route on path A.
- **Download** → downloads the `.md` artifact today, via the relocated
  `assembleCvMarkdown` + `cvFileSlug` (see §5). **Decided:** `.md`-only for now, single
  "Download" button (no PDF/Markdown menu) — until path B exists, a "Download → PDF"
  would just re-open the print dialog, which `Print` already covers. The button gains a
  true PDF download when path B lands.
- **Share** → both, via the Web Share API:
  - `navigator.share({ url, ... })` with the public CV URL (`cvPrintBase + "/cv"`).
  - Where the platform supports `navigator.canShare({ files })`, also attach the file
    (the `.md` now; PDF once path B exists).
  - Desktop / no-Web-Share fallback: copy the public link to clipboard (reuse the
    existing "copied" string feedback).

### 5. Consolidation / retire the in-panel CV

- **Relocate first (no behavior change):** move `assembleCvMarkdown` and `cvFileSlug`
  out of [`cv-panel-view.tsx`](../../../components/cv/cv-panel-view.tsx) into a shared,
  unit-testable module `lib/cv/markdown.ts`. The modal's Download/Share import from
  there.
- **Remove the panel CV path:**
  - `kb-context.tsx`: delete `CV_VIRTUAL_PATH` and `manifestWithCv` (the synthetic CV
    entry pinned atop the file list). `manifest` becomes the real KB files only. **Keep**
    `cvPrintBase`, `apiBasePath`, and everything else.
  - `kb-panel.tsx`: delete the `CV_VIRTUAL_PATH` special-case branch and the
    `CvPanelView` import. Panel becomes pure KB tree/viewer.
  - `home-shell.tsx`: `openCv` now opens the modal; drop the `openFile(CV_VIRTUAL_PATH)`
    + panel-expand behavior. Mount `<CvModal>`.
  - Delete `components/cv/cv-panel-view.tsx` after its helpers are relocated.
- **Verify-then-remove dead code:** the synthetic entry used `type: "cv"`
  ([`lib/kb/file-type.ts`](../../../lib/kb/file-type.ts) `KbFileType`,
  [`lib/kb/handlers.ts`](../../../lib/kb/handlers.ts) branch). After removing the
  synthetic entry, confirm `"cv"` is unused elsewhere; if so, remove the type member and
  its handler branch. If anything still references it, leave it and note why.

### 6. i18n

`KbStrings` already has `copy/copied/download/print/cv/openCv` (en + fr). Add `share`
(+ `shareAria`) labels in [`lib/language.ts`](../../../lib/language.ts) for both locales.
The CV section labels stay in [`lib/cv/strings.ts`](../../../lib/cv/strings.ts).

## Components & responsibilities

| Unit | Responsibility | Depends on |
|------|----------------|------------|
| `CvDocumentView` (rewritten) | Render structured `Kb` as the house style (screen + print) | `Kb`, `CV_STRINGS`, design tokens, `print.css` |
| `print.css` (rewritten) | A4 print fidelity | — |
| `cv-modal.tsx` (new) | Dialog chrome + toolbar; hosts the document | `useDialog`, `CvDocumentClient`, `useKb` (apiBasePath/cvPrintBase/lang), `lib/cv/markdown.ts` |
| `AppTopBar` (edit) | Prominent labeled CV button | `onOpenCv` |
| `HomeShell` (edit) | Owns `cvOpen`; mounts `CvModal`; rewires `openCv` | `CvModal` |
| `lib/cv/markdown.ts` (new) | `assembleCvMarkdown`, `cvFileSlug` | `Kb`, `allRepos` |
| `kb-context.tsx` / `kb-panel.tsx` (edit) | Remove synthetic CV entry + panel branch | — |

## Data flow (unchanged)

`loadCvKb(accountId, lang)` → privacy filter + cv-config → `Kb` → `/api/a/{username}/cv`
(and `/api/cv` for root) → `CvDocumentClient` fetch → `CvDocumentView`. The modal and the
standalone pages are just two mounts of the same client/render path.

## Error handling

- Modal fetch failure: `CvDocumentClient` already renders a "CV unavailable" state; the
  modal surfaces that inline (no crash, close still works).
- Web Share unsupported / user-cancelled: fall back to copy-link; a cancelled
  `navigator.share()` rejects with `AbortError` — swallow it (not an error state).
- Unconfigured account (`loadCvKb` → null): the API returns 503 and the standalone pages
  already show `NotConfiguredScreen`. The top-bar CV button should be **hidden** when the
  account has no configured content root (it already only renders when `onOpenCv` is
  passed — keep that gating).

## Testing

- **Update:** `tests/components/app-top-bar.test.tsx` — the prominent labeled button
  (label/role assertions change).
- **Remove/replace:** any test asserting the in-panel CV branch / `CV_VIRTUAL_PATH`
  behavior.
- **Add:** `lib/cv/markdown.ts` unit tests (moved from the panel's coverage —
  serializer output for profile/experience/education/skills/projects/open-source, fr
  variant, slug edge cases).
- **Add:** `CvModal` tests — opens from the button, renders the document (mock
  `/api/.../cv`), toolbar actions present, Esc/close works, Share falls back to
  copy-link when Web Share is absent.
- **Unaffected:** `tests/app/api/a/cv.test.ts`, `tests/lib/cv/*`, `tests/lib/kb/cv-config*`
  (the data pipeline is untouched).

## Out of scope (explicit)

- **Server-side PDF render (path B).** Fast-follow; reuses this template.
- Multiple templates / themes; user-supplied templates.
- Any change to the CV data pipeline, privacy filter, or `cv-config.yaml`.
- Changing the standalone `/cv` page's role (it stays the shareable/printable URL).

## Resolved decisions

- **Download format now:** `.md`-only, single "Download" button. PDF download arrives
  with the path-B fast-follow; `Print` covers Save-as-PDF in the meantime.
