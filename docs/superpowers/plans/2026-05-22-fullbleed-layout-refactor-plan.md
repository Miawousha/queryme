# Full-Bleed Layout Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the centered `max-w-6xl` page column with a true full-bleed two-pane app shell — a slim top bar over an edge-to-edge chat | KB split.

**Architecture:** `app/page.tsx` becomes a full-height flex column: a new `AppTopBar` (slim chrome) over `KbLayout` (the `flex-1` two-pane body). The old `<footer>` is removed; its links move into a new `AboutPopover` opened from the top bar. `Chat` drops its fixed-height rounded card and becomes a flush filling pane. `KbLayout` goes flush/full-bleed and accepts a controlled `collapsed` prop so the top bar can drive it.

**Tech Stack:** Next.js 15 (App Router, client components), React, Tailwind CSS v4, TypeScript. Design source: `docs/superpowers/specs/2026-05-22-fullbleed-layout-design.md`.

**Verification note:** This is a pure layout/UX refactor with no unit-testable logic. Per-task verification is `pnpm typecheck` (must pass). The final task verifies visually with the preview tool (screenshots at desktop + mobile, both themes) and `pnpm build`. The existing suite (`pnpm test`) must stay green throughout but no new unit tests are added — they would not meaningfully cover CSS layout.

---

### Task 1: Add UI strings for the About popover and KB toggle

**Files:**
- Modify: `lib/language.ts:46` (end of `en` block) and `lib/language.ts:90` (end of `fr` block)

The `footer` strings already exist (`lib/language.ts:16-21` and `:60-65`) and are reused as-is by the About popover. This task only adds the new `about` and `kbPanel` string groups.

- [ ] **Step 1: Add the `about` and `kbPanel` groups to the `en` block**

In `lib/language.ts`, the `en` object currently ends with:

```ts
    themeToggle: "Switch between light and dark theme",
  },
```

Replace that with:

```ts
    themeToggle: "Switch between light and dark theme",
    about: {
      buttonLabel: "About this project",
      title: "About this project",
      close: "Close",
    },
    kbPanel: {
      show: "Show the knowledge base panel",
      hide: "Hide the knowledge base panel",
    },
  },
```

- [ ] **Step 2: Add the same groups to the `fr` block**

The `fr` object currently ends with:

```ts
    themeToggle: "Basculer entre thème clair et sombre",
  },
```

Replace that with:

```ts
    themeToggle: "Basculer entre thème clair et sombre",
    about: {
      buttonLabel: "À propos de ce projet",
      title: "À propos de ce projet",
      close: "Fermer",
    },
    kbPanel: {
      show: "Afficher la base de connaissances",
      hide: "Masquer la base de connaissances",
    },
  },
```

- [ ] **Step 3: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: no errors. `UI_STRINGS` is `as const`; both language blocks now carry identical key shapes.

- [ ] **Step 4: Commit**

```bash
git add lib/language.ts
git commit -m "feat(layout): add UI strings for About popover and KB toggle"
```

---

### Task 2: Create the AboutPopover component

**Files:**
- Create: `components/about-popover.tsx`

A modal modeled on `components/mcp-modal.tsx` (same `open` / `onClose` contract, same overlay markup, Escape-to-close). It holds the transparency note and the three repo links that currently live in `app/page.tsx`'s `<footer>`.

- [ ] **Step 1: Create `components/about-popover.tsx`**

```tsx
"use client";

import { useEffect } from "react";

export type AboutPopoverStrings = {
  title: string;
  close: string;
  transparency: string;
  systemPrompt: string;
  kb: string;
  repo: string;
};

export type AboutPopoverProps = {
  open: boolean;
  onClose: () => void;
  strings: AboutPopoverStrings;
  repoUrl: string;
  branch: string;
};

/**
 * "About this project" modal. Holds the transparency note and the repo links
 * that used to live in the page footer, which the full-bleed app shell drops.
 * Open/close contract and overlay markup mirror `McpModal`.
 */
export function AboutPopover({
  open,
  onClose,
  strings,
  repoUrl,
  branch,
}: AboutPopoverProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const links: { href: string; label: string }[] = [
    { href: `${repoUrl}/blob/${branch}/prompts/system.md`, label: strings.systemPrompt },
    { href: `${repoUrl}/tree/${branch}/kb`, label: strings.kb },
    { href: repoUrl, label: strings.repo },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={strings.title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-md flex-col gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 className="font-display text-base font-semibold text-[var(--color-text-primary)]">
            {strings.title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={strings.close}
            className="text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-text-primary)]"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <p
          className="font-mono text-[10px] uppercase leading-relaxed text-[var(--color-text-tertiary)]"
          style={{ letterSpacing: "0.24em" }}
        >
          {strings.transparency}
        </p>

        <div className="flex flex-col gap-2 text-[13px]">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-2 text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-accent)]"
            >
              <span
                aria-hidden
                className="inline-block h-1 w-1 rounded-full bg-[var(--color-text-tertiary)] transition-colors group-hover:bg-[var(--color-accent)]"
              />
              {link.label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: no errors. The component is not yet rendered anywhere — it just compiles.

- [ ] **Step 3: Commit**

```bash
git add components/about-popover.tsx
git commit -m "feat(layout): add AboutPopover for the transparency note and repo links"
```

---

### Task 3: Create the AppTopBar component

**Files:**
- Create: `components/app-top-bar.tsx`

The slim full-width top bar. Left: `MatriceLogo` + name (lifted verbatim from the current `<header>` in `app/page.tsx:28-45`). Right: `ThemeToggle`, MCP button, `LanguageToggle`, an About button, and a desktop-only KB toggle button. All state is owned by the parent and passed via props.

- [ ] **Step 1: Create `components/app-top-bar.tsx`**

```tsx
"use client";

import { LanguageToggle } from "@/components/language-toggle";
import { MatriceLogo } from "@/components/matrice-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import type { UiLang } from "@/lib/language";

export type AppTopBarProps = {
  lang: UiLang;
  onLangChange: (next: UiLang) => void;
  themeToggleLabel: string;
  mcpButtonLabel: string;
  onOpenMcp: () => void;
  aboutButtonLabel: string;
  onOpenAbout: () => void;
  kbCollapsed: boolean;
  onToggleKb: () => void;
  kbShowLabel: string;
  kbHideLabel: string;
};

const PILL_CLASS =
  "inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-card)]/40 px-3 py-1 font-mono text-[10px] uppercase text-[var(--color-text-tertiary)] backdrop-blur transition-colors hover:text-[var(--color-accent)]";

/**
 * Slim full-width app chrome. Sits above the two-pane body in the app shell.
 * Owns no state — the parent passes language, modal openers, and the KB
 * collapsed state + toggle.
 */
export function AppTopBar({
  lang,
  onLangChange,
  themeToggleLabel,
  mcpButtonLabel,
  onOpenMcp,
  aboutButtonLabel,
  onOpenAbout,
  kbCollapsed,
  onToggleKb,
  kbShowLabel,
  kbHideLabel,
}: AppTopBarProps) {
  return (
    <header className="flex shrink-0 items-center justify-between gap-4 border-b border-[var(--color-border)] bg-[var(--color-surface)]/60 px-4 py-2.5 backdrop-blur sm:px-6">
      <div className="flex items-center gap-3">
        <MatriceLogo size={28} animated />
        <div className="flex flex-col leading-tight">
          <span
            className="font-mono text-[10px] uppercase text-[var(--color-primary)]"
            style={{ letterSpacing: "0.32em" }}
          >
            Alexandre Collet
          </span>
          <span
            className="font-display text-[14px] font-medium text-[var(--color-text-primary)]"
            style={{ letterSpacing: "-0.01em" }}
          >
            Queryable CV
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <ThemeToggle label={themeToggleLabel} />
        <button
          type="button"
          onClick={onOpenMcp}
          aria-label={mcpButtonLabel}
          aria-haspopup="dialog"
          className={PILL_CLASS}
          style={{ letterSpacing: "0.3em" }}
        >
          MCP
        </button>
        <button
          type="button"
          onClick={onOpenAbout}
          aria-label={aboutButtonLabel}
          aria-haspopup="dialog"
          className={PILL_CLASS}
          style={{ letterSpacing: "0.3em" }}
        >
          About
        </button>
        <LanguageToggle value={lang} onChange={onLangChange} />
        <button
          type="button"
          onClick={onToggleKb}
          aria-label={kbCollapsed ? kbShowLabel : kbHideLabel}
          aria-pressed={!kbCollapsed}
          className={`hidden sm:inline-flex ${PILL_CLASS}`}
          style={{ letterSpacing: "0.3em" }}
        >
          KB
        </button>
      </div>
    </header>
  );
}
```

Note: the KB toggle is `hidden sm:inline-flex` (desktop only). Mobile keeps `KbLayout`'s own floating KB button, which opens the full-screen overlay — see Task 4.

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: no errors. `MatriceLogo` accepts `size` and `animated`; `ThemeToggle` accepts `label`; `LanguageToggle` accepts `value` and `onChange`.

- [ ] **Step 3: Commit**

```bash
git add components/app-top-bar.tsx
git commit -m "feat(layout): add AppTopBar app-shell chrome component"
```

---

### Task 4: Refactor KbLayout to flush, full-bleed, controlled collapse, and mobile overlay

**Files:**
- Modify: `components/kb/kb-layout.tsx` (full rewrite)
- Modify: `components/kb/kb-panel.tsx:14` (one className change)

`KbLayout` keeps its resize divider, width persistence, and single-`chat`-instance invariant. Changes: panes go flush (no rounded card, no padding gap, divider flush); the KB pane gets `border-l` and sits flush to the viewport edge; the `collapsed` state becomes optionally controlled via props so the top bar can drive it; the mobile slide-over drawer becomes a full-screen overlay.

- [ ] **Step 1: Rewrite `components/kb/kb-layout.tsx`**

```tsx
"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

const WIDTH_KEY = "queryme:kbPanelWidth";
const MIN_PCT = 24;
const MAX_PCT = 60;
const DEFAULT_PCT = 38;

/**
 * Two-pane app-shell body: `chat` on the left, `panel` on the right. Fills the
 * viewport edge-to-edge — the KB pane is flush to the right screen edge.
 * Desktop (>= sm): a draggable divider sets the panel width (persisted); the
 * panel collapses to a flush rail. Mobile: single column, the panel is a
 * full-screen overlay toggled by the floating button.
 *
 * `collapsed` is optionally controlled: when `collapsed`/`onCollapsedChange`
 * are passed (by the app shell, so the top-bar KB button can drive it) they
 * win; otherwise the component keeps the state internally.
 */
export function KbLayout({
  chat,
  panel,
  collapsed: collapsedProp,
  onCollapsedChange,
}: {
  chat: ReactNode;
  panel: ReactNode;
  collapsed?: boolean;
  onCollapsedChange?: (next: boolean) => void;
}) {
  const [widthPct, setWidthPct] = useState(DEFAULT_PCT);
  const [collapsedInternal, setCollapsedInternal] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const dragging = useRef(false);

  const collapsed = collapsedProp ?? collapsedInternal;
  const setCollapsed = (next: boolean) => {
    onCollapsedChange?.(next);
    if (collapsedProp === undefined) setCollapsedInternal(next);
  };

  useEffect(() => {
    const stored = Number(localStorage.getItem(WIDTH_KEY));
    if (stored >= MIN_PCT && stored <= MAX_PCT) setWidthPct(stored);
  }, []);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragging.current) return;
      const pct = ((window.innerWidth - e.clientX) / window.innerWidth) * 100;
      setWidthPct(Math.min(MAX_PCT, Math.max(MIN_PCT, pct)));
    }
    function onUp() {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.userSelect = "";
      setWidthPct((w) => {
        localStorage.setItem(WIDTH_KEY, String(Math.round(w)));
        return w;
      });
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  return (
    <>
      {/*
        `chat` is rendered EXACTLY ONCE — it owns a `useChat` instance, so a
        second mount would create a second conversation. `panel` is stateless
        (it reads `KbContext`); rendering it in both the desktop pane and the
        mobile overlay is a harmless minor duplication.
      */}
      <div className="flex min-h-0 flex-1">
        {/* Chat — single instance, in flow on every breakpoint. */}
        <div className="min-w-0 flex-1">{chat}</div>

        {/* Desktop KB pane (>= sm only). */}
        {collapsed ? (
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            aria-label="Show the knowledge base panel"
            className="hidden w-9 shrink-0 items-center justify-center border-l border-[var(--color-border)] bg-[var(--color-card)]/30 font-mono text-[9px] uppercase text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-accent)] sm:flex"
            style={{ writingMode: "vertical-rl", letterSpacing: "0.3em" }}
          >
            KB
          </button>
        ) : (
          <>
            <div
              role="separator"
              aria-orientation="vertical"
              onMouseDown={() => {
                dragging.current = true;
                document.body.style.userSelect = "none";
              }}
              className="hidden w-1 shrink-0 cursor-col-resize bg-[var(--color-border)] transition-colors hover:bg-[var(--color-accent)] sm:block"
            />
            <div
              className="hidden shrink-0 flex-col border-l border-[var(--color-border)] bg-[var(--color-card)]/30 p-4 sm:flex"
              style={{ width: `${widthPct}%` }}
            >
              <button
                type="button"
                onClick={() => setCollapsed(true)}
                aria-label="Collapse the knowledge base panel"
                className="mb-2 self-end font-mono text-[10px] uppercase text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-accent)]"
                style={{ letterSpacing: "0.2em" }}
              >
                collapse ›
              </button>
              <div className="min-h-0 flex-1">{panel}</div>
            </div>
          </>
        )}
      </div>

      {/* Mobile KB trigger (< sm only). */}
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        className="fixed bottom-4 right-4 z-30 rounded-full border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-2 font-mono text-[10px] uppercase text-[var(--color-text-secondary)] shadow-lg sm:hidden"
        style={{ letterSpacing: "0.2em" }}
      >
        KB
      </button>
      {drawerOpen && (
        <div className="fixed inset-0 z-40 flex flex-col bg-[var(--color-background)] p-4 sm:hidden">
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close the knowledge base panel"
            className="mb-3 self-end font-mono text-[10px] uppercase text-[var(--color-text-tertiary)]"
            style={{ letterSpacing: "0.2em" }}
          >
            close ›
          </button>
          <div className="min-h-0 flex-1 overflow-auto">{panel}</div>
        </div>
      )}
    </>
  );
}
```

Key changes from the original: removed `mx-2`/`ml-2`/`mx-1` margins and `rounded-xl`/`rounded-full` on the pane, rail, and divider; the KB pane and rail now use `border-l` for the divider edge; the desktop pane is `flex flex-col` directly (the old inner `<div className="flex h-full flex-col">` wrapper is gone); the mobile drawer (`fixed inset-0 ... justify-end` + `w-[88%] max-w-sm` child) is now a full-screen overlay (`fixed inset-0 flex flex-col`, no dark backdrop, panel fills it).

- [ ] **Step 2: Make KbPanel fill its pane**

In `components/kb/kb-panel.tsx`, line 14 currently reads:

```tsx
    <aside className="flex h-full flex-col gap-3 overflow-hidden">
```

It already has `h-full` — confirm it is unchanged and still correct (the panel fills its pane in both the desktop pane and the mobile overlay). No edit needed unless `h-full` is absent; if so, add it. Leave the file otherwise untouched.

- [ ] **Step 3: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: no errors. The new `collapsed`/`onCollapsedChange` props are optional, so the existing `<KbLayout chat={…} panel={…} />` call site in `app/page.tsx` still compiles.

- [ ] **Step 4: Commit**

```bash
git add components/kb/kb-layout.tsx components/kb/kb-panel.tsx
git commit -m "feat(layout): make KbLayout flush, full-bleed, with controlled collapse and mobile overlay"
```

---

### Task 5: Refactor Chat into a flush filling pane

**Files:**
- Modify: `components/chat.tsx` (the rendered JSX in the `return`, `chat.tsx:113-247`)

Drop the fixed-height rounded card. The chat becomes `flex h-full flex-col`, filling its pane. The status header stays as a flush internal section. The message list and input row get an internal `max-w-3xl` centered wrapper for readability while the pane fills its half. `fade-up` moves from the card onto the message list. The accent glow span is kept (it already sits at the top edge).

- [ ] **Step 1: Replace the `<section>` opening tag and the glow span**

In `components/chat.tsx`, lines 114-125 currently read:

```tsx
    <section
      className="fade-up relative flex h-[68vh] min-h-[480px] flex-col overflow-hidden rounded-[20px] border border-[var(--color-border)] bg-[var(--color-card)]/70 backdrop-blur-md"
      style={{ animationDelay: "0.25s" }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 h-[260px] w-[260px] -translate-x-1/2 rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(var(--color-accent-rgb),0.10) 0%, transparent 70%)",
          filter: "blur(20px)",
        }}
      />
```

Replace with:

```tsx
    <section className="relative flex h-full flex-col overflow-hidden bg-[var(--color-card)]/20">
      <span
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 h-[260px] w-[420px] -translate-x-1/2 rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(var(--color-accent-rgb),0.10) 0%, transparent 70%)",
          filter: "blur(20px)",
        }}
      />
```

(The card border/radius/glass and the fixed height are dropped; the glow is widened slightly so it reads as a top-edge wash across the wider pane.)

- [ ] **Step 2: Wrap the scroll region's content in a centered max-width container**

In `components/chat.tsx`, the scroll region currently is `chat.tsx:155-201`:

```tsx
      <div ref={scrollRef} className="chat-scroll flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-5 sm:px-6">
        <ChatMessage role="assistant" text={intro} />
        {messages.map((m, i) => {
```

…through the closing of the `messages.length === 0` block and the `</div>`:

```tsx
          </div>
        )}
      </div>
```

Replace the **opening** `<div ref={scrollRef} …>` line with these two lines:

```tsx
      <div ref={scrollRef} className="chat-scroll flex-1 overflow-y-auto px-5 py-6 sm:px-6">
        <div className="fade-up mx-auto flex w-full max-w-3xl flex-col gap-4" style={{ animationDelay: "0.15s" }}>
```

And replace the **closing** `</div>` of the scroll region (the one right after the `messages.length === 0` block closes, originally `chat.tsx:201`) with:

```tsx
        </div>
      </div>
```

(Net: the scroll container keeps scrolling and padding; a new inner `max-w-3xl` wrapper centres the messages and carries the `fade-up` animation.)

- [ ] **Step 3: Center the toast and error rows**

In `components/chat.tsx`, the toast block (originally `chat.tsx:203-210`) has `className="mx-5 mb-3 …"`. Change `mx-5` to `mx-auto w-full max-w-3xl`:

```tsx
      {forwardToast && (
        <div
          role="status"
          className="mx-auto mb-3 w-full max-w-3xl rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]/60 px-3 py-2 text-xs text-[var(--color-text-secondary)]"
        >
          {forwardToast}
        </div>
      )}
```

And the error block (originally `chat.tsx:212-219`) the same way:

```tsx
      {error && (
        <div
          role="alert"
          className="mx-auto mb-3 w-full max-w-3xl rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300"
        >
          Something went wrong — please try again.
        </div>
      )}
```

- [ ] **Step 4: Center the input form's contents**

In `components/chat.tsx`, the form (originally `chat.tsx:221-245`) currently puts the layout classes on the `<form>` itself. Move the flex/padding to an inner wrapper so the input column aligns with the message column. Replace the form block with:

```tsx
      <form
        className="border-t border-[var(--color-border)] bg-[var(--color-surface)]/40"
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
      >
        <div className="mx-auto flex w-full max-w-3xl items-end gap-2 px-4 py-3 sm:px-5">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={placeholder}
            rows={1}
            className="min-h-[42px] resize-none border-transparent bg-transparent text-[14px] focus-visible:border-transparent focus-visible:ring-0"
            disabled={isBusy}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(input);
              }
            }}
          />
          <Button type="submit" disabled={isBusy || !input.trim()} className="shrink-0">
            {sendLabel}
          </Button>
        </div>
      </form>
```

The status `<header>` (`chat.tsx:127-153`) is left unchanged — it stays as a flush full-width internal section with its `border-b`.

- [ ] **Step 5: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add components/chat.tsx
git commit -m "feat(layout): make Chat a flush filling pane instead of a fixed-height card"
```

---

### Task 6: Rebuild app/page.tsx as the app shell

**Files:**
- Modify: `app/page.tsx` (full rewrite)

Wire everything together: a full-height flex column holding `AppTopBar` over `KbLayout`. The page owns `lang`, `mcpOpen`, `aboutOpen`, and `kbCollapsed`. The old `<main>` centered column, `<header>`, `<footer>`, and the `FooterLink` helper are removed.

- [ ] **Step 1: Rewrite `app/page.tsx`**

```tsx
"use client";

import { useState } from "react";
import { AppTopBar } from "@/components/app-top-bar";
import { AboutPopover } from "@/components/about-popover";
import { Chat } from "@/components/chat";
import { GridBackground } from "@/components/grid-background";
import { KbProvider } from "@/components/kb/kb-context";
import { KbPanel } from "@/components/kb/kb-panel";
import { KbLayout } from "@/components/kb/kb-layout";
import { McpModal } from "@/components/mcp-modal";
import { UI_STRINGS, type UiLang } from "@/lib/language";

const REPO_URL = process.env.NEXT_PUBLIC_REPO_URL ?? "https://github.com/Miawousha/queryme";
const BRANCH = process.env.NEXT_PUBLIC_REPO_BRANCH ?? "main";

export default function Home() {
  const [lang, setLang] = useState<UiLang>("en");
  const [mcpOpen, setMcpOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [kbCollapsed, setKbCollapsed] = useState(false);
  const t = UI_STRINGS[lang];

  return (
    <KbProvider>
      <GridBackground />

      <div className="relative z-10 flex h-screen flex-col">
        <AppTopBar
          lang={lang}
          onLangChange={setLang}
          themeToggleLabel={t.themeToggle}
          mcpButtonLabel={t.mcp.buttonLabel}
          onOpenMcp={() => setMcpOpen(true)}
          aboutButtonLabel={t.about.buttonLabel}
          onOpenAbout={() => setAboutOpen(true)}
          kbCollapsed={kbCollapsed}
          onToggleKb={() => setKbCollapsed((c) => !c)}
          kbShowLabel={t.kbPanel.show}
          kbHideLabel={t.kbPanel.hide}
        />

        <KbLayout
          collapsed={kbCollapsed}
          onCollapsedChange={setKbCollapsed}
          chat={
            <Chat
              intro={t.intro}
              placeholder={t.placeholder}
              sendLabel={t.send}
              startersTitle={t.startersTitle}
              starters={[...t.starters]}
            />
          }
          panel={<KbPanel />}
        />
      </div>

      <McpModal open={mcpOpen} onClose={() => setMcpOpen(false)} strings={t.mcp} />
      <AboutPopover
        open={aboutOpen}
        onClose={() => setAboutOpen(false)}
        strings={{
          title: t.about.title,
          close: t.about.close,
          transparency: t.footer.transparency,
          systemPrompt: t.footer.systemPrompt,
          kb: t.footer.kb,
          repo: t.footer.repo,
        }}
        repoUrl={REPO_URL}
        branch={BRANCH}
      />
    </KbProvider>
  );
}
```

The `MatriceLogo`, `LanguageToggle`, and `ThemeToggle` imports move into `AppTopBar` (Task 3), so they are no longer imported here. The `FooterLink` helper is deleted with the rest of the old markup.

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: no errors. `h-screen` on the column makes the `flex-1` `KbLayout` body fill the viewport below the top bar.

- [ ] **Step 3: Verify the existing test suite still passes**

Run: `pnpm test`
Expected: PASS (or "no tests" for the layout files). No existing test imports `app/page.tsx`, `chat.tsx`, or `kb-layout.tsx`, so they should be unaffected.

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx
git commit -m "feat(layout): rebuild page as a full-bleed two-pane app shell"
```

---

### Task 7: Visual verification at desktop and mobile

**Files:** none — verification only.

This task confirms the refactor visually. Use the preview tool, not Bash, for the dev server.

- [ ] **Step 1: Start the dev server and open the app**

Use `preview_start` (the project dev command is `pnpm dev`). Once running, the app is at `/`.

- [ ] **Step 2: Check the console and server logs for errors**

Run `preview_console_logs` and `preview_logs`.
Expected: no React errors, no hydration warnings, no 500s.

- [ ] **Step 3: Verify the desktop layout (~1440px)**

`preview_resize` to 1440×900, then `preview_screenshot`. Confirm against the design:
  - No centered-column margin — the shell spans the full viewport width.
  - The KB panel is flush to the **right edge** of the screen (no dead margin).
  - The top bar is a slim full-width strip; chat and KB panes fill the height below it.
  - Chat is a flush pane (no rounded floating card); messages are centred within it at a readable width.
  - Drag the resize divider (`preview_click` / drag) and confirm the split adjusts; click the top-bar **KB** button and confirm the panel collapses to a rail and expands again.
  - Open the **About** button and confirm the popover shows the transparency note + three links; close it. Open **MCP** and confirm that modal still works.

- [ ] **Step 4: Verify the mobile layout (~390px)**

`preview_resize` to 390×844, then `preview_screenshot`. Confirm:
  - Single chat column filling the viewport; the desktop KB pane and divider are hidden.
  - The floating **KB** button is visible bottom-right; clicking it opens a **full-screen** overlay with the panel; the close button dismisses it.

- [ ] **Step 5: Verify both themes**

Toggle the theme via the top-bar theme button (`preview_click`) and screenshot desktop + mobile again in the other theme. Confirm borders, surfaces, and the divider read correctly in both Arctic Light and Arctic Dark.

- [ ] **Step 6: Production build**

Run: `pnpm build`
Expected: build succeeds (it runs `validate:kb` then `next build`).

- [ ] **Step 7: Share proof and finish**

Post the desktop and mobile screenshots (both themes) for the user. If any check fails, read the relevant source file, fix it, re-commit, and re-verify from Step 2.

---

## Self-Review

**Spec coverage:**
- Decision 1 (push/split) — Task 4 keeps the resizable two-pane split. ✓
- Decision 2 (top bar) — Task 3 `AppTopBar` with logo/name + theme/MCP/language/About/KB. ✓
- Decision 3 (footer → About popover) — Tasks 2 + 6 (`AboutPopover`, footer removed). ✓
- Decision 4 (flush chat pane) — Task 5. ✓
- Decision 5 (panel open on first load) — Task 6 `useState(false)` for `kbCollapsed`. ✓
- Decision 6 (mobile full-screen overlay) — Task 4. ✓
- Decision 7 (no chat-only centered mode) — Task 5 uses an internal `max-w-3xl` on the message list, pane fills its half. ✓
- App shell structure (`flex h-screen flex-col`, no `max-w`/`mx-auto`) — Task 6. ✓
- `GridBackground` unchanged — confirmed (still rendered, untouched). ✓
- Controlled-collapse single source of truth — Task 4 optional props + Task 6 lifts state. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code. ✓

**Type consistency:** `collapsed`/`onCollapsedChange` (Task 4) match the `<KbLayout>` call in Task 6. `AboutPopoverStrings` keys (Task 2) match the object built in Task 6. `AppTopBarProps` (Task 3) match the props passed in Task 6. `kbShowLabel`/`kbHideLabel`/`kbPanel.show`/`kbPanel.hide` consistent across Tasks 1, 3, 6. ✓
