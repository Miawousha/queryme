# Queritae platform CTA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a discreet "queritae" wordmark pill to the chat and CV top bars that opens a short, personalized platform-explainer modal with CTAs to the landing page and GitHub signup, so visitors (interviewers/recruiters) can learn about Queritae and sign up themselves.

**Architecture:** One self-contained, purely-presentational client component (`QueritaeCta`) renders the pill trigger plus its own modal (open state via `useState`, a11y via the existing `useDialog` hook). It takes a **fully-resolved `pitch` string** — each host produces the personalized pitch from its own data, because the two surfaces have different data plumbing (the chat host has the persona baked into `buildUiStrings`; the CV host has `cvKb.profile.name`). The component drops into both top bars via one optional `queritae` prop on each bar.

**Tech Stack:** Next.js (App Router) · React client components · TypeScript · Tailwind v4 + CSS variables · Vitest + @testing-library/react.

## Global Constraints

- **Brand wordmark is lowercase** `queritae` everywhere (never "Queritae" in the pill text). The modal **title** may use title-case "Queritae".
- **No new dependencies.**
- **No new routes, no API/DB changes.** Outbound links are plain `<a>`: primary → `/?ref=profile`, secondary → `/api/auth/github/login`.
- **Use design tokens, not hardcoded px/hex:** color via `var(--color-*)`; type via the named scale (`text-2xs`, `text-control`, `font-mono`, `font-display`). Mirror the existing top-bar pill / `AboutPopover` styling.
- **i18n follows the existing server-assembled pattern** — add strings to `lib/language.ts` (chat) and `lib/cv/strings.ts` (CV); no new client i18n machinery.
- **Always on for everyone** — no owner hide-toggle, no plan gating.
- **The CV pill must never print** — it lives inside the CV top bar's existing `no-print` container; do not move it out.
- **`cn`** is imported from `@/lib/utils`; **`useDialog`** from `@/lib/use-dialog`.

### Deviations from the spec (intentional, locked here)

- The component takes a **resolved `pitch` string** rather than `{ pitchWithName, pitchGeneric, personaName }`. Personalization is host-side: the chat host bakes the name via `buildUiStrings` (matching the codebase's existing name-interpolation pattern); the CV host substitutes `{name}` from `cvKb.profile.name`.
- **No generic-pitch fallback.** Both surfaces always have an owner name (`persona.givenName` and `cvKb.profile.name` are non-empty by schema), so the generic variant is YAGNI and dropped.
- Each bar receives a single optional `queritae` prop (object) — additive and optional so the existing `app-top-bar.test.tsx` and any `CvTopBar` callers keep compiling without change.

---

### Task 1: `QueritaeCta` component (pill + modal)

The self-contained, presentational widget. No other task depends on its internals — only on its exported types/props (below).

**Files:**
- Create: `components/queritae-cta.tsx`
- Test: `tests/components/queritae-cta.test.tsx`

**Interfaces:**
- Consumes: `useDialog` (`@/lib/use-dialog`), `cn` (`@/lib/utils`).
- Produces (relied on by Tasks 2 & 3):
  ```ts
  export type QueritaeCtaStrings = {
    pill: string;        // "queritae"
    title: string;       // "What is Queritae?"
    pitch: string;       // fully-resolved, personalized sentence
    bullets: readonly string[];
    exploreCta: string;  // primary CTA label
    signupCta: string;   // secondary CTA label
    close: string;       // close-button aria-label
  };
  export type QueritaeCtaProps = {
    strings: QueritaeCtaStrings;
    landingHref: string; // "/?ref=profile"
    signupHref: string;  // "/api/auth/github/login"
    className?: string;   // tune pill sizing per host bar
  };
  export function QueritaeCta(props: QueritaeCtaProps): JSX.Element;
  ```

- [ ] **Step 1: Write the failing test**

Create `tests/components/queritae-cta.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueritaeCta, type QueritaeCtaStrings } from "@/components/queritae-cta";

const strings: QueritaeCtaStrings = {
  pill: "queritae",
  title: "What is Queritae?",
  pitch: "This is Alexandre's queryable CV — a résumé you can interview.",
  bullets: [
    "Grounded in real career notes",
    "Agent-native — built-in MCP endpoint",
    "Your own domain",
  ],
  exploreCta: "Explore Queritae →",
  signupCta: "Create yours with GitHub",
  close: "Close",
};

function renderCta() {
  return render(
    <QueritaeCta
      strings={strings}
      landingHref="/?ref=profile"
      signupHref="/api/auth/github/login"
    />,
  );
}

describe("QueritaeCta", () => {
  it("shows the wordmark pill and keeps the modal closed until clicked", () => {
    renderCta();
    const pill = screen.getByRole("button", { name: strings.title });
    expect(pill).toHaveTextContent("queritae");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens the modal with the personalized pitch and value bullets", () => {
    renderCta();
    fireEvent.click(screen.getByRole("button", { name: strings.title }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("This is Alexandre's queryable CV");
    for (const b of strings.bullets) {
      expect(dialog).toHaveTextContent(b);
    }
  });

  it("points the primary CTA at the landing page and the secondary at GitHub signup", () => {
    renderCta();
    fireEvent.click(screen.getByRole("button", { name: strings.title }));
    expect(screen.getByRole("link", { name: strings.exploreCta })).toHaveAttribute(
      "href",
      "/?ref=profile",
    );
    expect(screen.getByRole("link", { name: strings.signupCta })).toHaveAttribute(
      "href",
      "/api/auth/github/login",
    );
  });

  it("closes the modal via the close button", () => {
    renderCta();
    fireEvent.click(screen.getByRole("button", { name: strings.title }));
    fireEvent.click(screen.getByRole("button", { name: strings.close }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/components/queritae-cta.test.tsx`
Expected: FAIL — `Failed to resolve import "@/components/queritae-cta"` (module does not exist yet).

- [ ] **Step 3: Write the component**

Create `components/queritae-cta.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useDialog } from "@/lib/use-dialog";
import { cn } from "@/lib/utils";

export type QueritaeCtaStrings = {
  /** Lowercase wordmark shown in the pill. */
  pill: string;
  /** Modal heading + pill accessible name. */
  title: string;
  /** Fully-resolved, personalized pitch sentence (host substitutes the name). */
  pitch: string;
  /** Short value props. */
  bullets: readonly string[];
  /** Primary CTA label (→ landing). */
  exploreCta: string;
  /** Secondary CTA label (→ GitHub signup). */
  signupCta: string;
  /** Close-button accessible name. */
  close: string;
};

export type QueritaeCtaProps = {
  strings: QueritaeCtaStrings;
  /** Primary CTA target — the landing page, carrying the attribution param. */
  landingHref: string;
  /** Secondary CTA target — the GitHub OAuth entry point. */
  signupHref: string;
  /** Extra classes to tune the pill to its host bar. */
  className?: string;
};

/**
 * Neutral "queritae" wordmark pill that doubles as ambient platform attribution
 * and the trigger for a short platform-explainer modal. Self-contained: owns its
 * own open state and a11y wiring. Purely presentational — the host passes an
 * already-personalized `pitch`. Modal markup mirrors `AboutPopover`.
 */
export function QueritaeCta({ strings, landingHref, signupHref, className }: QueritaeCtaProps) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const dialogRef = useDialog<HTMLDivElement>(open, close);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={strings.title}
        title={strings.title}
        aria-haspopup="dialog"
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-card)]/40 px-2.5 py-1 font-mono text-2xs lowercase tracking-[0.14em] text-[var(--color-text-tertiary)] backdrop-blur transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]",
          className,
        )}
      >
        <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
        {strings.pill}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="queritae-cta-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={close}
        >
          <div
            ref={dialogRef}
            tabIndex={-1}
            className="flex w-full max-w-md flex-col gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-6 shadow-2xl outline-none"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <h2
                id="queritae-cta-title"
                className="font-display text-base font-semibold text-[var(--color-text-primary)]"
              >
                {strings.title}
              </h2>
              <button
                type="button"
                onClick={close}
                aria-label={strings.close}
                className="text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-text-primary)]"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <p className="text-control leading-relaxed text-[var(--color-text-secondary)]">
              {strings.pitch}
            </p>

            <ul className="flex flex-col gap-2 text-control">
              {strings.bullets.map((b) => (
                <li key={b} className="inline-flex items-center gap-2 text-[var(--color-text-secondary)]">
                  <span aria-hidden className="inline-block h-1 w-1 rounded-full bg-[var(--color-accent)]" />
                  {b}
                </li>
              ))}
            </ul>

            <div className="mt-1 flex flex-wrap items-center gap-3">
              <a
                href={landingHref}
                className="inline-flex items-center rounded-full bg-[var(--color-primary)] px-4 py-1.5 font-mono text-2xs font-medium uppercase tracking-[0.14em] text-white transition-opacity hover:opacity-90"
              >
                {strings.exploreCta}
              </a>
              <a
                href={signupHref}
                className="inline-flex items-center font-mono text-2xs uppercase tracking-[0.14em] text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-accent)]"
              >
                {strings.signupCta}
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/components/queritae-cta.test.tsx`
Expected: PASS — all 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add components/queritae-cta.tsx tests/components/queritae-cta.test.tsx
git commit -m "feat(cta): QueritaeCta platform-explainer pill + modal"
```

---

### Task 2: Wire the CTA into the chat top bar

Adds the `queritae` string namespace to the chat i18n table (name baked in), threads an optional `queritae` prop through `AppTopBar`, and passes it down from `home-shell`.

**Files:**
- Modify: `lib/language.ts` (add `queritae` to the `en` and `fr` objects in `buildUiStrings`)
- Modify: `components/app-top-bar.tsx` (add optional `queritae` prop; render `<QueritaeCta>`)
- Modify: `components/home-shell.tsx` (pass `queritae` into `AppTopBar`)
- Test: `tests/components/app-top-bar-queritae.test.tsx`

**Interfaces:**
- Consumes: `QueritaeCta`, `QueritaeCtaStrings` (Task 1).
- Produces: `t.queritae: QueritaeCtaStrings` on `UiStrings`; `AppTopBar` prop `queritae?: { strings: QueritaeCtaStrings; landingHref: string; signupHref: string } | null`.

- [ ] **Step 1: Write the failing test**

Create `tests/components/app-top-bar-queritae.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AppTopBar } from "@/components/app-top-bar";
import type { QueritaeCtaStrings } from "@/components/queritae-cta";

const queritaeStrings: QueritaeCtaStrings = {
  pill: "queritae",
  title: "What is Queritae?",
  pitch: "This is Alexandre's queryable CV — a résumé you can interview.",
  bullets: ["Grounded in real career notes", "Agent-native — built-in MCP endpoint", "Your own domain"],
  exploreCta: "Explore Queritae →",
  signupCta: "Create yours with GitHub",
  close: "Close",
};

function baseProps() {
  return {
    lang: "en" as const,
    onLangChange: vi.fn(),
    themeToggleLabel: "Theme",
    aboutButtonLabel: "About this project",
    onOpenAbout: vi.fn(),
    kbCollapsed: false,
    onToggleKb: vi.fn(),
    kbShowLabel: "Show KB",
    kbHideLabel: "Hide KB",
    queritae: {
      strings: queritaeStrings,
      landingHref: "/?ref=profile",
      signupHref: "/api/auth/github/login",
    },
  };
}

describe("AppTopBar — Queritae CTA", () => {
  it("renders the wordmark pill and opens the platform modal", () => {
    render(<AppTopBar {...baseProps()} />);
    fireEvent.click(screen.getByRole("button", { name: "What is Queritae?" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("This is Alexandre's queryable CV");
    expect(screen.getByRole("link", { name: "Explore Queritae →" })).toHaveAttribute(
      "href",
      "/?ref=profile",
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/components/app-top-bar-queritae.test.tsx`
Expected: FAIL — TypeScript/render error: `queritae` is not a known prop of `AppTopBar`, and no pill button is found.

- [ ] **Step 3: Add the `queritae` strings to the chat i18n table**

In `lib/language.ts`, inside `buildUiStrings`, add a `queritae` block to **both** the `en` and `fr` returned objects. Put it next to `about` in each.

In the `en` object (after the `about: { … }` block):

```ts
      queritae: {
        pill: "queritae",
        title: "What is Queritae?",
        pitch: `This is ${enGiven}'s queryable CV — a résumé you can interview. Queritae turns a GitHub repo of career notes into a grounded AI agent that answers questions, with citations.`,
        bullets: [
          "Grounded in real career notes",
          "Agent-native — built-in MCP endpoint",
          "Your own domain",
        ],
        exploreCta: "Explore Queritae →",
        signupCta: "Create yours with GitHub",
        close: "Close",
      },
```

In the `fr` object (after the `about: { … }` block):

```ts
      queritae: {
        pill: "queritae",
        title: "Qu'est-ce que Queritae ?",
        pitch: `Voici le CV interrogeable ${frGivenApos} — un CV que l'on peut interviewer. Queritae transforme un dépôt GitHub de notes de carrière en un agent IA fiable qui répond aux questions, avec citations.`,
        bullets: [
          "Fondé sur de vraies notes de carrière",
          "Pensé pour les agents — endpoint MCP intégré",
          "Votre propre domaine",
        ],
        exploreCta: "Découvrir Queritae →",
        signupCta: "Créez le vôtre avec GitHub",
        close: "Fermer",
      },
```

(`enGiven`, `frGiven`, and `frGivenApos` already exist at the top of `buildUiStrings`. `frGivenApos` resolves to `d'Alexandre` for the ALEX persona, so the FR pitch reads "…le CV interrogeable d'Alexandre".)

- [ ] **Step 4: Render `QueritaeCta` inside `AppTopBar`**

In `components/app-top-bar.tsx`:

Add the import at the top (with the other component imports):

```ts
import { QueritaeCta, type QueritaeCtaStrings } from "@/components/queritae-cta";
```

Add the prop to `AppTopBarProps` (after `kbHideLabel: string;`):

```ts
  /** Platform CTA wiring. When present, renders the "queritae" pill + modal. */
  queritae?: {
    strings: QueritaeCtaStrings;
    landingHref: string;
    signupHref: string;
  } | null;
```

Destructure it in the function signature (add `queritae,` alongside the other params).

Render the pill at the **end** of the right-hand controls cluster — immediately after the KB-toggle `</button>` and before the closing `</div>` of the controls group:

```tsx
        {queritae && (
          <QueritaeCta
            strings={queritae.strings}
            landingHref={queritae.landingHref}
            signupHref={queritae.signupHref}
          />
        )}
```

- [ ] **Step 5: Pass `queritae` down from `home-shell`**

In `components/home-shell.tsx`, in the `<AppTopBar … />` JSX (after `kbHideLabel={t.kbPanel.hide}`), add:

```tsx
          queritae={{
            strings: t.queritae,
            landingHref: "/?ref=profile",
            signupHref: "/api/auth/github/login",
          }}
```

- [ ] **Step 6: Run the new test + the language test**

Run: `npx vitest run tests/components/app-top-bar-queritae.test.tsx tests/lib/language.test.ts`
Expected: PASS — pill renders, modal opens, primary link href correct; the additive `queritae` key leaves the existing language assertions green.

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (confirms `t.queritae` satisfies `QueritaeCtaStrings` and the new `AppTopBar` prop type-checks).

- [ ] **Step 8: Commit**

```bash
git add lib/language.ts components/app-top-bar.tsx components/home-shell.tsx tests/components/app-top-bar-queritae.test.tsx
git commit -m "feat(cta): surface Queritae pill in the chat top bar"
```

---

### Task 3: Wire the CTA into the CV top bar

Adds the `queritae` strings to the CV i18n table (a `{name}` template), threads an optional `queritae` prop through `CvTopBar`, and has `cv-standalone` build the personalized strings from `cvKb.profile.name`.

**Files:**
- Modify: `lib/cv/strings.ts` (add `queritae` to `en` and `fr`)
- Modify: `components/cv/cv-top-bar.tsx` (add optional `queritae` prop; render `<QueritaeCta>`)
- Modify: `components/cv/cv-standalone.tsx` (substitute the name; pass `queritae` into `CvTopBar`)
- Test: `tests/components/cv/cv-top-bar-queritae.test.tsx`

**Interfaces:**
- Consumes: `QueritaeCta`, `QueritaeCtaStrings` (Task 1); `CV_STRINGS[lang].queritae` (this task); `cvKb.profile.name`.
- Produces: `CvTopBar` prop `queritae?: { strings: QueritaeCtaStrings; landingHref: string; signupHref: string }`.

- [ ] **Step 1: Write the failing test**

Create `tests/components/cv/cv-top-bar-queritae.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// CvTopBar uses next/navigation; stub it so the bar renders in jsdom.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import { CvTopBar } from "@/components/cv/cv-top-bar";
import type { QueritaeCtaStrings } from "@/components/queritae-cta";

const queritaeStrings: QueritaeCtaStrings = {
  pill: "queritae",
  title: "What is Queritae?",
  pitch: "This is Alexandre Collet's queryable CV — a résumé you can interview.",
  bullets: ["Grounded in real career notes", "Agent-native — built-in MCP endpoint", "Your own domain"],
  exploreCta: "Explore Queritae →",
  signupCta: "Create yours with GitHub",
  close: "Close",
};

describe("CvTopBar — Queritae CTA", () => {
  it("renders the wordmark pill and opens the platform modal", () => {
    render(
      <CvTopBar
        lang="en"
        printLabel="Print / Save as PDF"
        backLabel="queritae"
        basePath="/alex"
        queritae={{
          strings: queritaeStrings,
          landingHref: "/?ref=profile",
          signupHref: "/api/auth/github/login",
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "What is Queritae?" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("This is Alexandre Collet's queryable CV");
    expect(screen.getByRole("link", { name: "Create yours with GitHub" })).toHaveAttribute(
      "href",
      "/api/auth/github/login",
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/components/cv/cv-top-bar-queritae.test.tsx`
Expected: FAIL — `queritae` is not a known prop of `CvTopBar`; no pill button found.

- [ ] **Step 3: Add the `queritae` strings to the CV i18n table**

In `lib/cv/strings.ts`, add a `queritae` block to **both** the `en` and `fr` objects (after the `monthFormat` line in each). The pitch is a template with a `{name}` token (the CV table is static, so the host substitutes the name).

In `en`:

```ts
    queritae: {
      pill: "queritae",
      title: "What is Queritae?",
      pitchTemplate:
        "This is {name}'s queryable CV — a résumé you can interview. Queritae turns a GitHub repo of career notes into a grounded AI agent that answers questions, with citations.",
      bullets: [
        "Grounded in real career notes",
        "Agent-native — built-in MCP endpoint",
        "Your own domain",
      ],
      exploreCta: "Explore Queritae →",
      signupCta: "Create yours with GitHub",
      close: "Close",
    },
```

In `fr`:

```ts
    queritae: {
      pill: "queritae",
      title: "Qu'est-ce que Queritae ?",
      pitchTemplate:
        "Voici le CV interrogeable de {name} — un CV que l'on peut interviewer. Queritae transforme un dépôt GitHub de notes de carrière en un agent IA fiable qui répond aux questions, avec citations.",
      bullets: [
        "Fondé sur de vraies notes de carrière",
        "Pensé pour les agents — endpoint MCP intégré",
        "Votre propre domaine",
      ],
      exploreCta: "Découvrir Queritae →",
      signupCta: "Créez le vôtre avec GitHub",
      close: "Fermer",
    },
```

- [ ] **Step 4: Render `QueritaeCta` inside `CvTopBar`**

In `components/cv/cv-top-bar.tsx`:

Add the import (with the other imports):

```ts
import { QueritaeCta, type QueritaeCtaStrings } from "@/components/queritae-cta";
```

Add the prop to the destructured signature and its type. The current signature is:

```tsx
export function CvTopBar({
  lang,
  printLabel,
  backLabel,
  basePath = "",
}: {
  lang: UiLang;
  printLabel: string;
  backLabel: string;
  /** Account page base: "" for the root account (→ /cv) or "/{username}". */
  basePath?: string;
}) {
```

Change it to add `queritae`:

```tsx
export function CvTopBar({
  lang,
  printLabel,
  backLabel,
  basePath = "",
  queritae,
}: {
  lang: UiLang;
  printLabel: string;
  backLabel: string;
  /** Account page base: "" for the root account (→ /cv) or "/{username}". */
  basePath?: string;
  /** Platform CTA wiring. When present, renders the "queritae" pill + modal. */
  queritae?: {
    strings: QueritaeCtaStrings;
    landingHref: string;
    signupHref: string;
  };
}) {
```

Render the pill inside the existing right-hand controls `<div className="flex items-center gap-2">`, **after** the Print `</button>`:

```tsx
        {queritae && (
          <QueritaeCta
            strings={queritae.strings}
            landingHref={queritae.landingHref}
            signupHref={queritae.signupHref}
          />
        )}
```

(The whole bar already sits in a `no-print` container, so the pill never prints.)

- [ ] **Step 5: Build the personalized strings in `cv-standalone`**

In `components/cv/cv-standalone.tsx`, replace the body so it substitutes the owner name (`cvKb.profile.name`) into the template and passes `queritae` to `CvTopBar`:

```tsx
import type { Kb, KbLang } from "@/lib/kb/loader";
import { CV_STRINGS } from "@/lib/cv/strings";
import { CvDocumentView } from "./cv-document";
import { CvTopBar } from "./cv-top-bar";
import "./print.css";

/**
 * Standalone printable CV page body, shared by the root `/cv` route and the
 * per-account `/{username}/cv` route. `basePath` is "" for the root account
 * (links resolve to `/cv`) or `/{username}` for a per-account CV.
 */
export function CvStandalone({
  cvKb,
  lang,
  basePath,
  profileUrl,
  qrSvg,
}: {
  cvKb: Kb;
  lang: KbLang;
  basePath: string;
  profileUrl?: string;
  qrSvg?: string;
}) {
  const t = CV_STRINGS[lang];
  const q = t.queritae;
  const queritae = {
    strings: {
      pill: q.pill,
      title: q.title,
      pitch: q.pitchTemplate.replace("{name}", cvKb.profile.name),
      bullets: q.bullets,
      exploreCta: q.exploreCta,
      signupCta: q.signupCta,
      close: q.close,
    },
    landingHref: "/?ref=profile",
    signupHref: "/api/auth/github/login",
  };
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <CvTopBar
        lang={lang}
        printLabel={t.print}
        backLabel="queritae"
        basePath={basePath}
        queritae={queritae}
      />
      <CvDocumentView kb={cvKb} lang={lang} profileUrl={profileUrl} qrSvg={qrSvg} />
    </main>
  );
}
```

- [ ] **Step 6: Run the new test**

Run: `npx vitest run tests/components/cv/cv-top-bar-queritae.test.tsx`
Expected: PASS — pill renders, modal opens with the personalized pitch, secondary link href correct.

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (confirms `CV_STRINGS[lang].queritae` and the new `CvTopBar` prop type-check).

- [ ] **Step 8: Commit**

```bash
git add lib/cv/strings.ts components/cv/cv-top-bar.tsx components/cv/cv-standalone.tsx tests/components/cv/cv-top-bar-queritae.test.tsx
git commit -m "feat(cta): surface Queritae pill on the standalone CV"
```

---

### Task 4: Full-suite verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: PASS — all tests green, including the pre-existing `tests/components/app-top-bar.test.tsx`, `tests/components/about-popover.test.tsx`, and `tests/lib/language.test.ts`.

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no type errors; lint clean. (If `npm run lint` is not defined, skip it and note so.)

- [ ] **Step 3: Manual smoke (optional, if a dev server is available)**

Start the dev server and visit a profile + its CV:
- Chat page (`/{username}`): the `queritae` pill appears at the right of the top bar; clicking opens the modal; "Explore Queritae →" → `/?ref=profile`; "Create yours with GitHub" → `/api/auth/github/login`; the pitch names the owner.
- CV page (`/{username}/cv`): the pill appears next to Print; modal works; the pill is absent from the browser print preview.

- [ ] **Step 4: Final commit (only if Steps 1–2 surfaced fixes)**

```bash
git add -A
git commit -m "test(cta): full-suite + typecheck green for Queritae CTA"
```

---

## Self-Review

**1. Spec coverage**

| Spec item | Task |
| --- | --- |
| Neutral top-bar wordmark pill (not a "powered by" badge) | Task 1 (pill markup) |
| Separate, dedicated button + own modal (not folded into About) | Task 1 (own modal) |
| Chat surface | Task 2 |
| CV surface | Task 3 |
| Personalized pitch (owner name) | Task 2 (chat, baked) + Task 3 (CV, substituted) |
| Primary CTA → landing `/?ref=profile`; secondary → GitHub OAuth | Task 1 (links) + Tasks 2–3 (hrefs) |
| Bilingual (en/fr), server-assembled | Task 2 (`lib/language.ts`) + Task 3 (`lib/cv/strings.ts`) |
| Always on for everyone; no toggle/gating | Tasks 2–3 (always passed) |
| Never prints on CV | Task 3 (lives in `no-print` bar) |
| No analytics funnel (only inert `?ref=profile`) | Global Constraints |
| No new deps / routes / About-modal changes | Global Constraints |

**2. Placeholder scan:** No "TBD"/"TODO"/"handle edge cases". Every code step contains complete code; the only literal token is the intentional `{name}` substituted in Task 3 Step 5.

**3. Type consistency:** `QueritaeCtaStrings`/`QueritaeCtaProps` defined in Task 1 are used verbatim in Tasks 2–3. The bar prop shape `{ strings, landingHref, signupHref }` is identical on both bars. Chat passes `t.queritae` (shape matches `QueritaeCtaStrings` exactly — `pitch` baked); CV builds the object with `pitch` from `pitchTemplate.replace("{name}", …)` (CV table has `pitchTemplate`, not `pitch`, so the host maps it — consistent with the deviation note).
