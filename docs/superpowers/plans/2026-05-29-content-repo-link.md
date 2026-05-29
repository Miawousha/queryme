# Content-Repo Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a GitHub icon link in the app top bar that points at the active persona *content* repo (`getActivePersonaSourceRow().repoUrl`), rendered only when a source is configured.

**Architecture:** `app/page.tsx` (async server component) reads the active persona-source row and passes `contentRepoUrl: string | null` down the existing prop chain `HomePageClient → HomeShell`. `HomeShell` composes a `{ url, label }` object (label from a new localized `sourceRepoLabel` string) and passes it to `AppTopBar`, which renders a conditional external `<a>` styled like the other icon buttons.

**Tech Stack:** Next.js 15 (server + client components), React 19, TypeScript, Tailwind, vitest + @testing-library/react + jsdom.

---

## Spec

`docs/superpowers/specs/2026-05-29-content-repo-link-design.md`

## File Structure

- Modify: `components/app-top-bar.tsx` — add an optional `sourceRepo?: { url; label } | null` prop, a conditional GitHub `<a>`, and a `GitHubIcon`. (Single optional prop keeps the existing caller typechecking between tasks.)
- Modify: `lib/language.ts` — add `sourceRepoLabel` to the `en` and `fr` locale objects.
- Modify: `app/page.tsx` — read `getActivePersonaSourceRow()`, pass `contentRepoUrl`.
- Modify: `components/home-page-client.tsx` — thread `contentRepoUrl`.
- Modify: `components/home-shell.tsx` — accept `contentRepoUrl`, pass the composed `sourceRepo` object.
- Create: `tests/components/app-top-bar.test.tsx`.

**Prop-shape decision (refines the spec):** instead of two separate `contentRepoUrl` + `sourceRepoLabel` props on `AppTopBar`, use one optional `sourceRepo: { url: string; label: string } | null`. The URL (server data) still threads as a plain string through `page → HomePageClient → HomeShell`; only `HomeShell` (which has the locale strings `t`) composes the `{ url, label }` object. This keeps `AppTopBar` to one optional prop and every intermediate commit typechecking.

All commands use `pnpm` from the repo root.

---

## Task 1: AppTopBar GitHub link

**Files:**
- Modify: `components/app-top-bar.tsx`
- Create: `tests/components/app-top-bar.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/components/app-top-bar.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppTopBar, type AppTopBarProps } from "@/components/app-top-bar";

// ThemeToggle's effect reads window.matchMedia (absent in jsdom) UNLESS
// <html data-theme> is already set. Set it so the effect early-returns.
beforeEach(() => {
  document.documentElement.dataset.theme = "dark";
});

function baseProps(overrides: Partial<AppTopBarProps> = {}): AppTopBarProps {
  return {
    lang: "en",
    onLangChange: vi.fn(),
    themeToggleLabel: "Theme",
    mcpButtonLabel: "MCP",
    onOpenMcp: vi.fn(),
    aboutButtonLabel: "About",
    onOpenAbout: vi.fn(),
    kbCollapsed: false,
    onToggleKb: vi.fn(),
    kbShowLabel: "Show",
    kbHideLabel: "Hide",
    ...overrides,
  };
}

describe("AppTopBar source-repo link", () => {
  it("renders an external GitHub link when sourceRepo is provided", () => {
    render(
      <AppTopBar
        {...baseProps({
          sourceRepo: { url: "https://github.com/owner/repo", label: "View CV source on GitHub" },
        })}
      />,
    );
    const link = screen.getByRole("link", { name: "View CV source on GitHub" });
    expect(link).toHaveAttribute("href", "https://github.com/owner/repo");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders no source-repo link when sourceRepo is null", () => {
    render(<AppTopBar {...baseProps({ sourceRepo: null })} />);
    expect(screen.queryByRole("link", { name: "View CV source on GitHub" })).toBeNull();
  });

  it("renders no source-repo link when sourceRepo is omitted", () => {
    render(<AppTopBar {...baseProps()} />);
    expect(screen.queryByRole("link")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/components/app-top-bar.test.tsx`
Expected: FAIL — `sourceRepo` is not a valid `AppTopBarProps` property (type error) / no matching link.

- [ ] **Step 3: Add the prop to the type**

In `components/app-top-bar.tsx`, in `AppTopBarProps`, add the `sourceRepo` line immediately after `onOpenAbout: () => void;`:

```tsx
  aboutButtonLabel: string;
  onOpenAbout: () => void;
  /** Active persona content repo to link to (icon button), or null to hide it. */
  sourceRepo?: { url: string; label: string } | null;
  cvButtonLabel?: string;
```

- [ ] **Step 4: Destructure the prop**

In the `AppTopBar({ ... })` parameter list, add `sourceRepo,` immediately after `onOpenAbout,`:

```tsx
  aboutButtonLabel,
  onOpenAbout,
  sourceRepo,
  cvButtonLabel,
```

- [ ] **Step 5: Render the conditional link**

Immediately after the About `</button>` block (the one containing `<InfoIcon />`) and before the `{onOpenCv && (` block, insert:

```tsx
        {sourceRepo && (
          <a
            href={sourceRepo.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={sourceRepo.label}
            title={sourceRepo.label}
            className={ICON_BTN}
          >
            <GitHubIcon />
          </a>
        )}
```

- [ ] **Step 6: Add the GitHubIcon component**

After the `InfoIcon` function definition, add:

```tsx
/** GitHub mark — links to the persona content repository. */
function GitHubIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.56-.29-5.25-1.28-5.25-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.07 11.07 0 0 1 2.9-.39c.98 0 1.97.13 2.9.39 2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.43-2.69 5.41-5.26 5.69.41.36.78 1.05.78 2.12 0 1.53-.01 2.76-.01 3.14 0 .31.21.68.8.56A10.52 10.52 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5z" />
    </svg>
  );
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `pnpm vitest run tests/components/app-top-bar.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 8: Typecheck (tree stays green)**

Run: `pnpm typecheck`
Expected: clean. `sourceRepo` is optional, so the existing `HomeShell` call to `<AppTopBar .../>` (which doesn't pass it yet) still typechecks.

- [ ] **Step 9: Commit**

```bash
git add components/app-top-bar.tsx tests/components/app-top-bar.test.tsx
git commit -m "feat(ui): add optional source-repo GitHub link to AppTopBar"
```

---

## Task 2: Wire the content repo URL through to the top bar

**Files:**
- Modify: `lib/language.ts`
- Modify: `app/page.tsx`
- Modify: `components/home-page-client.tsx`
- Modify: `components/home-shell.tsx`

- [ ] **Step 1: Add the localized label (en)**

In `lib/language.ts`, in the `en` locale object, add a `sourceRepoLabel` line immediately after the `en` `themeToggle` line:

```tsx
      themeToggle: "Switch between light and dark theme",
      sourceRepoLabel: "View CV source on GitHub",
```

- [ ] **Step 2: Add the localized label (fr)**

In `lib/language.ts`, in the `fr` locale object, add a `sourceRepoLabel` line immediately after the `fr` `themeToggle` line:

```tsx
      themeToggle: "Basculer entre thème clair et sombre",
      sourceRepoLabel: "Voir la source du CV sur GitHub",
```

- [ ] **Step 3: Read the active source row in page.tsx and pass the URL**

In `app/page.tsx`:

1. Extend the import to include `getActivePersonaSourceRow`:

```tsx
import { ensurePersonaCacheReady, getActivePersonaRoot, getActivePersonaSourceRow } from "@/lib/persona-source";
```

2. Replace the body after `const persona = loadPersona(root);` so it reads the source row and passes the URL:

```tsx
  const persona = loadPersona(root);
  const strings = buildUiStrings(persona);
  const sourceRow = await getActivePersonaSourceRow();
  return <HomePageClient strings={strings} contentRepoUrl={sourceRow?.repoUrl ?? null} />;
```

- [ ] **Step 4: Thread the prop through HomePageClient**

In `components/home-page-client.tsx`:

1. Add the prop to `Props`:

```tsx
type Props = {
  /** Pre-built strings for both locales, computed server-side from persona. */
  strings: AllLocaleStrings;
  /** GitHub URL of the active persona content repo, or null if none configured. */
  contentRepoUrl: string | null;
};
```

2. Destructure it and pass it to `HomeShell`:

```tsx
export function HomePageClient({ strings, contentRepoUrl }: Props) {
```

and add `contentRepoUrl={contentRepoUrl}` to the `<HomeShell ... />` element (alongside the existing props):

```tsx
      <HomeShell
        t={t}
        lang={lang}
        onLangChange={setLang}
        mcpOpen={mcpOpen}
        onMcpOpenChange={setMcpOpen}
        aboutOpen={aboutOpen}
        onAboutOpenChange={setAboutOpen}
        kbCollapsed={kbCollapsed}
        onKbCollapsedChange={setKbCollapsed}
        contentRepoUrl={contentRepoUrl}
      />
```

- [ ] **Step 5: Accept and forward from HomeShell**

In `components/home-shell.tsx`:

1. Add to the `Props` type, after `onKbCollapsedChange: ...;`:

```tsx
  onKbCollapsedChange: (next: boolean | ((prev: boolean) => boolean)) => void;
  /** GitHub URL of the active persona content repo, or null if none configured. */
  contentRepoUrl: string | null;
};
```

2. Add `contentRepoUrl,` to the destructured parameters (after `onKbCollapsedChange,`).

3. Pass the composed object to `AppTopBar` — add this prop to the existing `<AppTopBar ... />`:

```tsx
        <AppTopBar
          lang={lang}
          onLangChange={onLangChange}
          themeToggleLabel={t.themeToggle}
          mcpButtonLabel={t.mcp.buttonLabel}
          onOpenMcp={() => onMcpOpenChange(true)}
          aboutButtonLabel={t.about.buttonLabel}
          onOpenAbout={() => onAboutOpenChange(true)}
          sourceRepo={contentRepoUrl ? { url: contentRepoUrl, label: t.sourceRepoLabel } : null}
          cvButtonLabel={t.kb.openCv}
          onOpenCv={openCv}
          kbCollapsed={kbCollapsed}
          onToggleKb={() => onKbCollapsedChange((c) => !c)}
          kbShowLabel={t.kbPanel.show}
          kbHideLabel={t.kbPanel.hide}
        />
```

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: clean. `t.sourceRepoLabel` now exists on both locales (Steps 1-2), and the full prop chain is connected.

- [ ] **Step 7: Run the full test suite**

Run: `pnpm test`
Expected: all tests pass (288 on the current baseline + the 3 new AppTopBar tests = 291), 0 failures.

- [ ] **Step 8: Manual visual check (owner: human)**

Run the dev server (`pnpm dev`) and open the home page. Confirm: a GitHub mark icon button appears in the top-bar cluster (next to the ⓘ button); hovering shows "View CV source on GitHub"; clicking opens the content repo (e.g. `https://github.com/Miawousha/queryme-content-alex`) in a new tab. Toggle to French and confirm the title reads "Voir la source du CV sur GitHub". (This step needs a browser; if running headless, skip and rely on the unit tests + typecheck.)

- [ ] **Step 9: Commit**

```bash
git add lib/language.ts app/page.tsx components/home-page-client.tsx components/home-shell.tsx
git commit -m "feat(ui): link the active persona content repo from the top bar"
```

---

## Self-Review

**Spec coverage:**
- Link points at the active content repo (`getActivePersonaSourceRow().repoUrl`) → Task 2 Step 3. ✓
- Top-bar icon button next to Info, reusing `ICON_BTN` → Task 1 Steps 5-6. ✓
- Icon-only, localized `aria-label`/`title` → Task 1 Step 5 + Task 2 Steps 1-2. ✓
- Opens repo root in a new tab (`target="_blank" rel="noopener noreferrer"`) → Task 1 Step 5. ✓
- Renders only when a source is configured (null → absent) → Task 1 Step 5 (conditional) + Task 2 Step 5 (null composition). ✓
- About popover untouched → no task modifies `about-popover.tsx`. ✓
- Testing: AppTopBar renders link when provided / absent when null → Task 1 Step 1 (3 tests). ✓

**Placeholder scan:** none — every step has concrete code/commands.

**Type consistency:** `sourceRepo?: { url: string; label: string } | null` defined in Task 1 (AppTopBar) and constructed in Task 2 Step 5 with matching keys (`url`, `label`). `contentRepoUrl: string | null` is consistent across `page.tsx` (Task 2 Step 3), `HomePageClient` (Step 4), and `HomeShell` (Step 5). `sourceRepoLabel` added to both locales (Steps 1-2) before it's read as `t.sourceRepoLabel` (Step 5), so typecheck in Step 6 passes. ✓

**Decomposition note:** `sourceRepo` is optional on `AppTopBar`, so the tree typechecks after Task 1 even though the caller wires it only in Task 2 — no broken intermediate commit.
