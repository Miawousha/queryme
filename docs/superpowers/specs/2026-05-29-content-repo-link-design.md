# Content-Repo Link in the Top Bar — Design

**Date:** 2026-05-29
**Status:** Approved (pending implementation plan)

## Purpose

Surface a visible link in the app UI to the GitHub repository that the active
persona content was synced from — the *content* repo (e.g.
`Miawousha/queryme-content-alex`), not the app's source repo. Today this content
repo is not linked anywhere in the UI; the only repo link present is the *app*
repo, buried in the "About this project" popover.

## Decisions

| Decision | Choice |
|---|---|
| Which repo | The **active persona content repo** (`getActivePersonaSourceRow().repoUrl`), not the app source repo (`REPO_URL`). |
| Placement | A GitHub **icon button in the existing top-bar icon cluster** (`AppTopBar`), next to the Info (ⓘ) button. Always visible. |
| Style | **Icon-only**, reusing the existing `ICON_BTN` styling, with a localized `aria-label`/`title`. |
| Link target | The repo **root** URL, opened in a new tab (`target="_blank" rel="noopener noreferrer"`). |
| About popover | **Unchanged** — it keeps its existing app-repo links. |

## Background

- `getActivePersonaSourceRow(): Promise<PersonaSource | null>` (in
  `lib/persona-source.ts`) returns the latest `ok` persona-source row, whose
  `repoUrl` is the GitHub repo the content was synced from. `parseGitHubRepoUrl`
  guarantees every stored `repoUrl` is a `https://github.com/<owner>/<repo>` URL,
  so it is safe to link to directly.
- `persona.yaml` (via `loadPersona`) does **not** contain a repo field — it is
  name/locale/i18n only. So the content repo URL must come from the source row,
  not the persona.
- `app/page.tsx` is already an async server component: it calls
  `ensurePersonaCacheReady()`, `getActivePersonaRoot()`, and `loadPersona(root)`,
  then renders `<HomePageClient strings={...} />`. It returns `<NotConfiguredScreen />`
  early when there is no active root.
- The UI prop chain is `app/page.tsx` → `HomePageClient` → `HomeShell` → `AppTopBar`.
- `AppTopBar` already renders an icon-button cluster (theme, MCP, info, optional
  CV, language, panel toggle) using a shared `ICON_BTN` class and 14px stroke
  icons. The optional CV button (`onOpenCv && (...)`) is the precedent for a
  conditionally-rendered control.
- `lib/language.ts` `buildUiStrings(persona)` returns `{ en, fr }` UI strings;
  per-locale labels are read in `HomeShell` and passed to `AppTopBar` as
  individual label props (e.g. `themeToggleLabel`, `aboutButtonLabel`).

## Data flow

1. `app/page.tsx` reads the active source row and derives the URL:
   `const sourceRow = await getActivePersonaSourceRow();`
   `const contentRepoUrl = sourceRow?.repoUrl ?? null;`
2. It passes `contentRepoUrl` into `<HomePageClient contentRepoUrl={...} strings={...} />`.
3. `HomePageClient` threads `contentRepoUrl` to `HomeShell`.
4. `HomeShell` passes `contentRepoUrl` plus the localized label
   (`t.sourceRepoLabel`) into `AppTopBar` as `contentRepoUrl` / `sourceRepoLabel`.
5. `AppTopBar` renders the GitHub link **only when `contentRepoUrl` is non-null**.

When no persona source is configured (e.g. a local-override dev box with no DB
row), `contentRepoUrl` is `null` and the link is simply absent — graceful
degradation, mirroring the optional CV button.

## Components

- **`GitHubIcon`** — a new small component in `app-top-bar.tsx` rendering the
  standard GitHub mark (a filled `path` with `fill="currentColor"`), sized to
  match the cluster (~14px). (The other icons are stroke-based; the GitHub mark
  is conventionally a filled glyph, so it gets its own SVG rather than reusing
  `ICON_PROPS`.)
- **`AppTopBar` GitHub link** — an `<a>` styled with `ICON_BTN`, placed next to
  the Info button:
  ```tsx
  {contentRepoUrl && (
    <a
      href={contentRepoUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={sourceRepoLabel}
      title={sourceRepoLabel}
      className={ICON_BTN}
    >
      <GitHubIcon />
    </a>
  )}
  ```

## UI strings

Add `sourceRepoLabel` to both locales in `lib/language.ts`:
- en: `"View CV source on GitHub"`
- fr: `"Voir la source du CV sur GitHub"`

## Files touched

- `app/page.tsx` — read `getActivePersonaSourceRow()`, pass `contentRepoUrl`.
- `components/home-page-client.tsx` — add `contentRepoUrl: string | null` prop, thread it.
- `components/home-shell.tsx` — accept and forward `contentRepoUrl`; pass `t.sourceRepoLabel`.
- `components/app-top-bar.tsx` — add `contentRepoUrl?: string | null` + `sourceRepoLabel` props, the conditional `<a>`, and `GitHubIcon`.
- `lib/language.ts` — add `sourceRepoLabel` (en + fr).
- `tests/components/app-top-bar.test.tsx` — new.

## Edge cases

- **No source row** → `contentRepoUrl` null → link not rendered.
- **Non-GitHub URL** → not possible; `parseGitHubRepoUrl` enforces `github.com/<owner>/<repo>` at sync time.
- **SSR cost** → one extra indexed query (latest `ok` row) on homepage render. Negligible and consistent with the page's existing DB usage.

## Testing

Uses the existing vitest + testing-library + jsdom setup; no new infrastructure.

- `tests/components/app-top-bar.test.tsx`:
  - Renders a link with `href === contentRepoUrl`, an accessible name equal to
    `sourceRepoLabel`, and `target="_blank"` / `rel="noopener noreferrer"` when
    `contentRepoUrl` is provided.
  - Renders **no** such link when `contentRepoUrl` is `null`/omitted.

Server-component wiring in `app/page.tsx` (the DB read) is not unit-tested here —
it is a thin pass-through verified manually; the conditional rendering logic that
matters lives in `AppTopBar` and is covered.

## Out of scope (YAGNI)

- No change to the About popover or its app-repo links.
- No link to a specific branch or synced commit — repo root only.
- No new icon button for the app source repo (that link already exists in About).
- No persona.yaml schema changes.
