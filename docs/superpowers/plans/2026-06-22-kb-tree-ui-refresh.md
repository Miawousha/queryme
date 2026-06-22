# KB tree UI refresh — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh the chat-page KB tree — relocate the cited-lens to a header pill, full-width filter, indent guides + a citation "trail rail", quiet file glyphs, a latest-answer Sources strip, a desktop hover/peek preview, and a density toggle — without changing the tree model or citation semantics.

**Architecture:** New behaviour lands in small focused units (two pure libs, four components, two hooks); only `filter`/`lens` view-state lifts out of `useKbTreeState` up to `KbPanel`. Expansion/auto-reveal/pulse stay in the tree. The Sources strip reads a new `latestAnswer` value derived in `chat.tsx` and exposed via `KbContext`.

**Tech Stack:** Next.js (App Router) + React client components, TypeScript, Tailwind with CSS custom properties in `app/globals.css`, Vitest + Testing Library (jsdom).

Spec: [docs/superpowers/specs/2026-06-22-kb-tree-ui-refresh-design.md](../specs/2026-06-22-kb-tree-ui-refresh-design.md)

## Global Constraints

- **Branch:** `kb-tree-ui-refresh` (already created off `main`). Ships as one PR.
- **Aesthetic is preserved:** mono-uppercase tracked labels, cyan `--color-accent`, blue `--color-primary`. No sentence-casing of labels. Colors via CSS custom properties only (`var(--color-…)`, `rgba(var(--color-accent-rgb), …)`); never hardcode hex in components.
- **No new dependencies.** No icon library — glyphs are hand-rolled inline `<svg>` matching the existing `Chevron`/toolbar-icon style.
- **`KbFileType` is exactly `"md" | "yaml" | "html" | "pdf"`** — no other values exist.
- **Density default = `compact` = today's exact spacing.** Zero visual regression in the default state.
- **Peek is pointer-only:** disabled when `matchMedia("(hover: none)")` matches; only `md`/`yaml` docs peek.
- **i18n:** every new UI string gets an `en` and a `fr` entry in `lib/language.ts` AND a matching entry in the `KB_STRINGS` fixture (`tests/helpers/kb-fixtures.tsx`). The `KbStrings` type must stay exhaustive (TypeScript errors otherwise).
- **Test commands:** a single file → `npx vitest run <path>`; typecheck → `npm run typecheck`; full suite → `npm test`.
- **Commits:** end every commit message with:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

### Task 1: `deriveLatestAnswer` (pure)

The Sources strip shows the sources the *most recent* answer cited. `citedRefs` only records each pair's first-appearance message, so a follow-up that re-cites an earlier source can't be recovered from it. This pure function re-parses the latest citing message and maps each cite to its conversation-global index.

**Files:**
- Create: `lib/kb/latest-answer.ts`
- Test: `tests/lib/kb/latest-answer.test.ts`

**Interfaces:**
- Consumes: `parseCitations` and `Citation` from `@/lib/kb/citations`; `CitedRef`, `citedRefKey` from `@/lib/kb/cited-paths`.
- Produces:
  - `type LatestAnswer = { messageId: string; refs: CitedRef[] }`
  - `function deriveLatestAnswer(assistantMessages: { id: string; text: string }[], indexMap: Record<string, number>): LatestAnswer | null`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { deriveLatestAnswer } from "@/lib/kb/latest-answer";
import { citedRefKey } from "@/lib/kb/cited-paths";

const idx: Record<string, number> = {
  [citedRefKey("experience/2021-ion.md", null)]: 1,
  [citedRefKey("experience/2025-altergo.md", "overview")]: 2,
};

describe("deriveLatestAnswer", () => {
  it("returns null when no assistant message cites anything", () => {
    expect(deriveLatestAnswer([{ id: "a", text: "no cites here" }], idx)).toBeNull();
    expect(deriveLatestAnswer([], idx)).toBeNull();
  });

  it("uses the most recent citing message and tags refs with its id + global index", () => {
    const out = deriveLatestAnswer(
      [
        { id: "a", text: "First [^kb:experience/2021-ion.md]." },
        { id: "b", text: "Then [^kb:experience/2025-altergo.md#overview]." },
      ],
      idx,
    );
    expect(out).toEqual({
      messageId: "b",
      refs: [{ path: "experience/2025-altergo.md", anchor: "overview", index: 2, messageId: "b" }],
    });
  });

  it("dedupes repeated cites within the same message, keeping first order", () => {
    const out = deriveLatestAnswer(
      [{ id: "b", text: "[^kb:experience/2025-altergo.md#overview] x [^kb:experience/2025-altergo.md#overview]" }],
      idx,
    );
    expect(out?.refs).toHaveLength(1);
  });

  it("surfaces a re-cited earlier source under the latest message (the key behavior)", () => {
    const out = deriveLatestAnswer(
      [
        { id: "a", text: "intro [^kb:experience/2021-ion.md]" },
        { id: "b", text: "follow-up re-cites [^kb:experience/2021-ion.md]" },
      ],
      idx,
    );
    expect(out).toEqual({
      messageId: "b",
      refs: [{ path: "experience/2021-ion.md", anchor: null, index: 1, messageId: "b" }],
    });
  });

  it("drops cites whose key is absent from the index map", () => {
    const out = deriveLatestAnswer([{ id: "b", text: "[^kb:experience/unknown.md]" }], idx);
    expect(out).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx vitest run tests/lib/kb/latest-answer.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/kb/latest-answer"`.

- [ ] **Step 3: Implement**

```ts
import { parseCitations } from "@/lib/kb/citations";
import { citedRefKey, type CitedRef } from "@/lib/kb/cited-paths";

/** The most recent assistant answer that cited ≥1 source, plus its (deduped)
 * refs carrying conversation-global indices. */
export type LatestAnswer = { messageId: string; refs: CitedRef[] };

/**
 * Walks assistant messages newest-first; the first message that carries any
 * citation wins. Its citations are de-duplicated (first order kept) and each
 * resolved to its global index via `indexMap`; cites absent from the map are
 * dropped (not browseable). Returns null when no message cites a known source.
 */
export function deriveLatestAnswer(
  assistantMessages: { id: string; text: string }[],
  indexMap: Record<string, number>,
): LatestAnswer | null {
  for (let i = assistantMessages.length - 1; i >= 0; i--) {
    const m = assistantMessages[i];
    const cites = parseCitations(m.text);
    if (cites.length === 0) continue;
    const seen = new Set<string>();
    const refs: CitedRef[] = [];
    for (const c of cites) {
      const key = citedRefKey(c.path, c.anchor);
      if (seen.has(key)) continue;
      seen.add(key);
      const index = indexMap[key];
      if (index === undefined) continue;
      refs.push({ path: c.path, anchor: c.anchor, index, messageId: m.id });
    }
    if (refs.length > 0) return { messageId: m.id, refs };
  }
  return null;
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx vitest run tests/lib/kb/latest-answer.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/kb/latest-answer.ts tests/lib/kb/latest-answer.test.ts
git commit -m "feat(kb): deriveLatestAnswer — sources cited by the latest answer

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `extractExcerpt` (pure)

The peek card shows a short text excerpt of a doc or a section. This pure helper extracts it from raw markdown (frontmatter stripped, code fences respected), reusing the shared slug logic so its section matching agrees with the tree.

**Files:**
- Create: `lib/kb/peek-extract.ts`
- Test: `tests/lib/kb/peek-extract.test.ts`

**Interfaces:**
- Consumes: `slugify` from `@/lib/kb/slug`.
- Produces:
  - `type PeekTarget = { kind: "doc" } | { kind: "section"; slug: string }`
  - `function extractExcerpt(rawText: string, target: PeekTarget, maxChars?: number): string` (default `maxChars = 240`)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { extractExcerpt } from "@/lib/kb/peek-extract";

const DOC = `---
title: ION
role: CTO
---
# ION Energy

Built battery analytics for fleets.

## Overview

Founding team, 0 to 1 product.

## Battery telemetry

Real-time pipelines at scale.
`;

describe("extractExcerpt", () => {
  it("doc: skips frontmatter + a leading H1, returns the intro body", () => {
    expect(extractExcerpt(DOC, { kind: "doc" })).toBe("Built battery analytics for fleets.");
  });

  it("section: returns text from the heading down to the next heading", () => {
    expect(extractExcerpt(DOC, { kind: "section", slug: "overview" })).toBe(
      "Founding team, 0 to 1 product.",
    );
  });

  it("section: last section runs to end of file", () => {
    expect(extractExcerpt(DOC, { kind: "section", slug: "battery-telemetry" })).toBe(
      "Real-time pipelines at scale.",
    );
  });

  it("section: unmatched slug falls back to the doc intro", () => {
    expect(extractExcerpt(DOC, { kind: "section", slug: "nope" })).toBe(
      "Built battery analytics for fleets.",
    );
  });

  it("ignores headings inside fenced code blocks", () => {
    const md = "Intro line.\n\n\`\`\`\n## not a heading\n\`\`\`\n";
    expect(extractExcerpt(md, { kind: "doc" })).toBe("Intro line.");
  });

  it("truncates to maxChars with an ellipsis", () => {
    const md = "x".repeat(50);
    expect(extractExcerpt(md, { kind: "doc" }, 10)).toBe("xxxxxxxxx…");
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx vitest run tests/lib/kb/peek-extract.test.ts`
Expected: FAIL — cannot resolve `@/lib/kb/peek-extract`.

- [ ] **Step 3: Implement**

```ts
import { slugify } from "@/lib/kb/slug";

/** What a peek targets: the whole doc's intro, or a specific section by slug. */
export type PeekTarget = { kind: "doc" } | { kind: "section"; slug: string };

const FRONTMATTER_RE = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;
const HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const FENCE_RE = /^(`{3,}|~{3,})/;

type Line = { text: string; heading: { slug: string; level: number } | null };

/** Tag each line as a heading (outside code fences) or plain text, mirroring
 * extractSections' fence handling and duplicate-slug suffixing. */
function scan(body: string): Line[] {
  const out: Line[] = [];
  const used = new Map<string, number>();
  let fenceChar: string | null = null;
  for (const text of body.split("\n")) {
    const fence = text.match(FENCE_RE);
    if (fence) {
      const ch = fence[1][0];
      fenceChar = fenceChar === null ? ch : fenceChar === ch ? null : fenceChar;
      out.push({ text, heading: null });
      continue;
    }
    if (fenceChar !== null) {
      out.push({ text, heading: null });
      continue;
    }
    const m = text.match(HEADING_RE);
    if (!m) {
      out.push({ text, heading: null });
      continue;
    }
    let slug = slugify(m[2].trim());
    const n = used.get(slug) ?? 0;
    used.set(slug, n + 1);
    if (slug && n > 0) slug = `${slug}-${n}`;
    out.push({ text, heading: { slug, level: m[1].length } });
  }
  return out;
}

/** Join the first run of non-empty, non-heading body lines within [start, end). */
function body(lines: Line[], start: number, end: number): string {
  const parts: string[] = [];
  for (let i = start; i < end; i++) {
    const l = lines[i];
    if (l.heading) break;
    if (l.text.trim() === "") {
      if (parts.length > 0) break;
      continue;
    }
    parts.push(l.text.trim());
  }
  return parts.join(" ");
}

function clamp(s: string, maxChars: number): string {
  return s.length > maxChars ? `${s.slice(0, maxChars - 1).trimEnd()}…` : s;
}

/** Extract a short plain-text excerpt for the peek card. Section excerpts run
 * from the matching heading to the next heading; doc excerpts are the intro
 * paragraph (after frontmatter + a leading H1). Unmatched section → doc intro. */
export function extractExcerpt(rawText: string, target: PeekTarget, maxChars = 240): string {
  const lines = scan(rawText.replace(FRONTMATTER_RE, ""));

  if (target.kind === "section") {
    const start = lines.findIndex((l) => l.heading?.slug === target.slug);
    if (start !== -1) {
      let end = start + 1;
      while (end < lines.length && !lines[end].heading) end++;
      return clamp(body(lines, start + 1, end), maxChars);
    }
    // fall through to doc intro on no match
  }

  // doc intro: skip a single leading H1, then the first body run
  const first = lines.findIndex((l) => l.text.trim() !== "");
  const start = first !== -1 && lines[first].heading?.level === 1 ? first + 1 : Math.max(first, 0);
  return clamp(body(lines, start, lines.length), maxChars);
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx vitest run tests/lib/kb/peek-extract.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/kb/peek-extract.ts tests/lib/kb/peek-extract.test.ts
git commit -m "feat(kb): extractExcerpt — plain-text doc/section excerpt for peek

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Strings + `latestAnswer` context plumbing + chat wiring

Adds all new i18n strings, threads `latestAnswer` through `KbContext`, computes it in `chat.tsx`, and keeps the test fixtures exhaustive. No new UI yet — this is the wiring the strip (Task 6), pill (Task 10), density (Task 10), and peek (Tasks 8–9) consume. Behaviour is covered by Task 1 (derivation) and Task 6 (rendering); this task verifies via typecheck + the full suite.

**Files:**
- Modify: `lib/language.ts` (KbStrings type + `en`/`fr` literals)
- Modify: `components/kb/kb-context.tsx`
- Modify: `components/chat.tsx`
- Modify: `tests/helpers/kb-fixtures.tsx`

**Interfaces:**
- Consumes: `LatestAnswer` (Task 1).
- Produces on `KbContext`: `latestAnswer: LatestAnswer | null`, `setLatestAnswer: (v: LatestAnswer | null) => void`.
- Produces new `KbStrings` keys: `sourcesTitle`, `sourcesCollapse`, `sourcesExpand`, `densityLabel`, `densityCompact`, `densityComfortable`, `peekLoading`.

- [ ] **Step 1: Add the new string keys to the `KbStrings` type**

In `lib/language.ts`, find the `KbStrings` type (it lists keys like `filterPlaceholder`, `referencedLens`, `citationJump`). Add these keys (all `string`):

```ts
  sourcesTitle: string;
  sourcesCollapse: string;
  sourcesExpand: string;
  densityLabel: string;
  densityCompact: string;
  densityComfortable: string;
  peekLoading: string;
```

- [ ] **Step 2: Add the `en` values**

In the `en` KB strings literal (near `referencedLensAria: "Show only documents referenced in this conversation",` ~line 137), add:

```ts
        sourcesTitle: "Sources · this answer",
        sourcesCollapse: "Collapse sources",
        sourcesExpand: "Expand sources",
        densityLabel: "Row spacing",
        densityCompact: "Compact",
        densityComfortable: "Comfortable",
        peekLoading: "Loading preview…",
```

- [ ] **Step 3: Add the `fr` values**

In the `fr` KB strings literal (near `referencedLensAria: "Afficher uniquement les documents référencés dans cette conversation",` ~line 287), add:

```ts
        sourcesTitle: "Sources · cette réponse",
        sourcesCollapse: "Réduire les sources",
        sourcesExpand: "Afficher les sources",
        densityLabel: "Espacement des lignes",
        densityCompact: "Compact",
        densityComfortable: "Confortable",
        peekLoading: "Chargement de l’aperçu…",
```

- [ ] **Step 4: Add `latestAnswer` to `KbContext`**

In `components/kb/kb-context.tsx`:

Import the type (top, near the `CitedRef` import):
```ts
import type { LatestAnswer } from "@/lib/kb/latest-answer";
```

Add to the `KbContextValue` type (after the `setCitedRefs` line):
```ts
  /** Sources the most recent answer cited; null when none. Drives the strip. */
  latestAnswer: LatestAnswer | null;
  setLatestAnswer: (v: LatestAnswer | null) => void;
```

In `KbProvider`, after the `citedRefs` state (line ~107):
```ts
  const [latestAnswer, setLatestAnswer] = useState<LatestAnswer | null>(null);
```

Add `latestAnswer` and `setLatestAnswer` to the `value` object (after `setCitedRefs,`) and to the `useMemo` dependency array (add `latestAnswer`; `setLatestAnswer` is a stable `useState` setter and may be omitted, matching how `setCitedRefs` is handled).

- [ ] **Step 5: Wire the derivation in `components/chat.tsx`**

Add the import (near line 14):
```ts
import { deriveLatestAnswer } from "@/lib/kb/latest-answer";
```

Add `setLatestAnswer` to the `useKb()` destructure (line ~116):
```ts
  const { setCitedRefs, setLatestAnswer, openFile, onJumpToMessage, seenAutoReveal } = useKb();
```

Replace the `extractedRefs` memo (lines ~306–311) with a lifted `assistantMessages` memo plus the refs memo:
```ts
  // Single extraction pass — both the KB panel context and the superscripts
  // are built from this one memo so messages are never traversed twice.
  const assistantMessages = useMemo(
    () => messages.filter((m) => m.role !== "user").map((m) => ({ id: m.id, text: messageText(m) })),
    [messages],
  );
  const extractedRefs = useMemo(() => extractCitations(assistantMessages), [assistantMessages]);
```

After the existing `citationIndices` memo (line ~317) add:
```ts
  const latestAnswer = useMemo(
    () => deriveLatestAnswer(assistantMessages, citationIndices),
    [assistantMessages, citationIndices],
  );

  useEffect(() => {
    setLatestAnswer(latestAnswer);
  }, [latestAnswer, setLatestAnswer]);
```

- [ ] **Step 6: Keep the test fixture exhaustive**

In `tests/helpers/kb-fixtures.tsx`:

Add the seven new keys to the `KB_STRINGS` object (after `referencedLensAria`):
```ts
  sourcesTitle: "Sources · this answer",
  sourcesCollapse: "Collapse sources",
  sourcesExpand: "Expand sources",
  densityLabel: "Row spacing",
  densityCompact: "Compact",
  densityComfortable: "Comfortable",
  peekLoading: "Loading preview…",
```

Add to the `base` object inside `makeKbContext` (after `setCitedRefs: vi.fn(),`):
```ts
    latestAnswer: null,
    setLatestAnswer: vi.fn(),
```

- [ ] **Step 7: Typecheck + full suite**

Run: `npm run typecheck && npm test`
Expected: PASS — no type errors (KbStrings exhaustive, context shape matches), all existing tests green.

- [ ] **Step 8: Commit**

```bash
git add lib/language.ts components/kb/kb-context.tsx components/chat.tsx tests/helpers/kb-fixtures.tsx
git commit -m "feat(kb): thread latestAnswer through context + add refresh strings

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `KbFileGlyph` component

Replaces the per-row `MD`/`YAML`/… text badge with a small muted inline-SVG glyph, shown only for non-markdown types (markdown → nothing, the quiet default).

**Files:**
- Create: `components/kb/kb-file-glyph.tsx`
- Test: `tests/components/kb/kb-file-glyph.test.tsx`

**Interfaces:**
- Consumes: `KbFileType` from `@/lib/kb/file-type`.
- Produces: `function KbFileGlyph({ type, className }: { type: KbFileType; className?: string }): JSX.Element | null`. Renders nothing for `"md"`. Non-md glyphs carry `data-kb-glyph={type}` and `aria-hidden`.

- [ ] **Step 1: Write the failing test**

```tsx
/** @vitest-environment jsdom */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { KbFileGlyph } from "@/components/kb/kb-file-glyph";

describe("KbFileGlyph", () => {
  it("renders nothing for markdown (the quiet default)", () => {
    const { container } = render(<KbFileGlyph type="md" />);
    expect(container.firstChild).toBeNull();
  });

  it.each(["yaml", "html", "pdf"] as const)("renders an aria-hidden glyph for %s", (type) => {
    const { container } = render(<KbFileGlyph type={type} />);
    const glyph = container.querySelector(`[data-kb-glyph="${type}"]`);
    expect(glyph).not.toBeNull();
    expect(glyph).toHaveAttribute("aria-hidden");
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx vitest run tests/components/kb/kb-file-glyph.test.tsx`
Expected: FAIL — cannot resolve `@/components/kb/kb-file-glyph`.

- [ ] **Step 3: Implement**

```tsx
import type { KbFileType } from "@/lib/kb/file-type";
import { cn } from "@/lib/utils";

const PATHS: Record<Exclude<KbFileType, "md">, string> = {
  // simple line glyphs in a 24×24 box, stroked with currentColor
  yaml: "M4 7h16M4 12h10M4 17h7",
  html: "M8 6l-4 6 4 6M16 6l4 6-4 6",
  pdf: "M6 3h8l4 4v14H6zM14 3v4h4",
};

/** Muted type glyph for KB rows. Markdown (the dominant type) renders nothing
 * so the right edge stays quiet; other types get a small line glyph. */
export function KbFileGlyph({ type, className }: { type: KbFileType; className?: string }) {
  if (type === "md") return null;
  return (
    <svg
      data-kb-glyph={type}
      aria-hidden
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("shrink-0 text-[var(--color-text-tertiary)]", className)}
    >
      <path d={PATHS[type]} />
    </svg>
  );
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx vitest run tests/components/kb/kb-file-glyph.test.tsx`
Expected: PASS (4 cases).

- [ ] **Step 5: Commit**

```bash
git add components/kb/kb-file-glyph.tsx tests/components/kb/kb-file-glyph.test.tsx
git commit -m "feat(kb): KbFileGlyph — quiet type glyph (md renders nothing)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: `useKbDensity` hook + density CSS

Adds the persisted `compact`/`comfortable` preference and the CSS that applies it. The toggle UI is wired in Task 10.

**Files:**
- Create: `lib/kb/use-kb-density.ts`
- Modify: `app/globals.css`
- Test: `tests/lib/kb/use-kb-density.test.ts`

**Interfaces:**
- Produces:
  - `type KbDensity = "compact" | "comfortable"`
  - `function useKbDensity(): [KbDensity, () => void]` — `[current, toggle]`, persisted in `localStorage` key `queritae:kbDensity`; default `"compact"`.
- CSS contract: the tree scroll container carries `data-kb-density={density}`; `comfortable` increases `[data-kb-row]` vertical padding. `compact` keeps today's spacing (no rule).

- [ ] **Step 1: Write the failing test**

```ts
/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useKbDensity } from "@/lib/kb/use-kb-density";

beforeEach(() => localStorage.clear());

describe("useKbDensity", () => {
  it("defaults to compact", () => {
    const { result } = renderHook(() => useKbDensity());
    expect(result.current[0]).toBe("compact");
  });

  it("toggle flips to comfortable and persists", () => {
    const { result } = renderHook(() => useKbDensity());
    act(() => result.current[1]());
    expect(result.current[0]).toBe("comfortable");
    expect(localStorage.getItem("queritae:kbDensity")).toBe("comfortable");
  });

  it("rehydrates a persisted value on mount", () => {
    localStorage.setItem("queritae:kbDensity", "comfortable");
    const { result } = renderHook(() => useKbDensity());
    expect(result.current[0]).toBe("comfortable");
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx vitest run tests/lib/kb/use-kb-density.test.ts`
Expected: FAIL — cannot resolve `@/lib/kb/use-kb-density`.

- [ ] **Step 3: Implement the hook**

```ts
"use client";

import { useCallback, useEffect, useState } from "react";

export type KbDensity = "compact" | "comfortable";

const KEY = "queritae:kbDensity";

/** KB tree row density, persisted globally (like the panel width). Defaults to
 * `compact` (today's spacing) so there is no regression in the default state. */
export function useKbDensity(): [KbDensity, () => void] {
  const [density, setDensity] = useState<KbDensity>("compact");

  // Rehydrate after mount (SSR-safe: server always renders compact).
  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) === "comfortable") setDensity("comfortable");
    } catch {
      /* storage unavailable */
    }
  }, []);

  const toggle = useCallback(() => {
    setDensity((d) => {
      const next: KbDensity = d === "compact" ? "comfortable" : "compact";
      try {
        localStorage.setItem(KEY, next);
      } catch {
        /* storage unavailable — state stays in memory */
      }
      return next;
    });
  }, []);

  return [density, toggle];
}
```

- [ ] **Step 4: Add the CSS**

In `app/globals.css`, directly after the `.kb-pulse` / `@keyframes kb-flash` block (the "KB tree — citation chips and the auto-reveal pulse" section), add:

```css
/* KB tree — comfortable density (compact is the default; no rule needed) */
[data-kb-density="comfortable"] [data-kb-row] {
  padding-top: 0.375rem;
  padding-bottom: 0.375rem;
}
```

- [ ] **Step 5: Run the test, verify it passes**

Run: `npx vitest run tests/lib/kb/use-kb-density.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/kb/use-kb-density.ts app/globals.css tests/lib/kb/use-kb-density.test.ts
git commit -m "feat(kb): useKbDensity hook + comfortable-density CSS

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: `KbSourcesStrip` component

The auto-shown strip listing the sources the latest answer cited. Reads `latestAnswer` + `manifest` from context; hidden when nothing browseable was cited. Collapsible; collapsed state persisted per account.

**Files:**
- Create: `components/kb/kb-sources-strip.tsx`
- Test: `tests/components/kb/kb-sources-strip.test.tsx`

**Interfaces:**
- Consumes: `useKb()` → `latestAnswer`, `manifest`, `openFile`, `strings`, `apiBasePath`; `anchorMatches` from `@/lib/kb/slug`.
- Produces: `function KbSourcesStrip(): JSX.Element | null` (no props; renders `null` when there is nothing to show).

- [ ] **Step 1: Write the failing test**

```tsx
/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KbSourcesStrip } from "@/components/kb/kb-sources-strip";
import { useKb } from "@/components/kb/kb-context";
import type { KbFile } from "@/lib/kb/manifest";
import { makeKbContext } from "@/tests/helpers/kb-fixtures";

vi.mock("@/components/kb/kb-context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/kb/kb-context")>();
  return { ...actual, useKb: vi.fn() };
});

const FILES: KbFile[] = [
  {
    path: "experience/2025-altergo.md",
    title: "2025 — Altergo",
    type: "md",
    sections: [{ slug: "overview", title: "Overview", level: 2 }],
  },
  { path: "experience/2021-ion.md", title: "2021 — ION Energy", type: "md" },
];

beforeEach(() => {
  vi.mocked(useKb).mockReset();
  sessionStorage.clear();
});

describe("KbSourcesStrip", () => {
  it("renders nothing when there is no latest answer", () => {
    vi.mocked(useKb).mockReturnValue(makeKbContext({ manifest: FILES, latestAnswer: null }));
    const { container } = render(<KbSourcesStrip />);
    expect(container.firstChild).toBeNull();
  });

  it("lists the latest answer's sources in index order with section labels", () => {
    vi.mocked(useKb).mockReturnValue(
      makeKbContext({
        manifest: FILES,
        latestAnswer: {
          messageId: "b",
          refs: [
            { path: "experience/2021-ion.md", anchor: null, index: 1, messageId: "b" },
            { path: "experience/2025-altergo.md", anchor: "overview", index: 2, messageId: "b" },
          ],
        },
      }),
    );
    render(<KbSourcesStrip />);
    expect(screen.getByText(/2021 — ION Energy/)).toBeInTheDocument();
    const altergo = screen.getByText(/2025 — Altergo/);
    expect(altergo).toBeInTheDocument();
    expect(altergo.closest("button")).toHaveTextContent("Overview");
  });

  it("drops refs whose path is missing from the manifest", () => {
    vi.mocked(useKb).mockReturnValue(
      makeKbContext({
        manifest: FILES,
        latestAnswer: {
          messageId: "b",
          refs: [{ path: "ghost.md", anchor: null, index: 9, messageId: "b" }],
        },
      }),
    );
    const { container } = render(<KbSourcesStrip />);
    expect(container.firstChild).toBeNull();
  });

  it("clicking a row opens the viewer at that path + anchor", async () => {
    const openFile = vi.fn();
    const user = userEvent.setup();
    vi.mocked(useKb).mockReturnValue(
      makeKbContext({
        manifest: FILES,
        openFile,
        latestAnswer: {
          messageId: "b",
          refs: [{ path: "experience/2025-altergo.md", anchor: "overview", index: 2, messageId: "b" }],
        },
      }),
    );
    render(<KbSourcesStrip />);
    await user.click(screen.getByRole("button", { name: /2025 — Altergo/ }));
    expect(openFile).toHaveBeenCalledExactlyOnceWith("experience/2025-altergo.md", "overview");
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx vitest run tests/components/kb/kb-sources-strip.test.tsx`
Expected: FAIL — cannot resolve `@/components/kb/kb-sources-strip`.

- [ ] **Step 3: Implement**

```tsx
"use client";

import { useMemo, useState } from "react";
import { useKb } from "@/components/kb/kb-context";
import { anchorMatches } from "@/lib/kb/slug";

const LABEL = "font-mono text-2xs uppercase text-[var(--color-text-tertiary)]";
const LABEL_STYLE = { letterSpacing: "0.24em" };

type Row = { index: number; path: string; anchor: string | null; docTitle: string; sectionTitle?: string };

/** Auto-shown strip above the tree listing the sources the latest answer cited.
 * Hidden when the latest answer cited nothing browseable. */
export function KbSourcesStrip() {
  const { latestAnswer, manifest, openFile, strings, apiBasePath } = useKb();
  const storageKey = `queritae:kbSources:${apiBasePath}`;
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(storageKey) === "1";
    } catch {
      return false;
    }
  });

  const rows = useMemo<Row[]>(() => {
    if (!latestAnswer) return [];
    return latestAnswer.refs
      .map((r): Row | null => {
        const file = manifest.find((f) => f.path === r.path);
        if (!file) return null;
        const section = r.anchor
          ? file.sections?.find((s) => anchorMatches(r.anchor!, s.slug))
          : undefined;
        return { index: r.index, path: r.path, anchor: r.anchor, docTitle: file.title, sectionTitle: section?.title };
      })
      .filter((r): r is Row => r !== null)
      .sort((a, b) => a.index - b.index);
  }, [latestAnswer, manifest]);

  if (rows.length === 0) return null;

  const toggle = () => {
    setCollapsed((c) => {
      const next = !c;
      try {
        sessionStorage.setItem(storageKey, next ? "1" : "0");
      } catch {
        /* storage unavailable */
      }
      return next;
    });
  };

  return (
    <div className="mb-2 rounded border border-[rgba(var(--color-accent-rgb),0.25)] bg-[rgba(var(--color-accent-rgb),0.05)]">
      <button
        type="button"
        aria-expanded={!collapsed}
        aria-label={collapsed ? strings.sourcesExpand : strings.sourcesCollapse}
        onClick={toggle}
        className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left transition-colors hover:bg-[rgba(var(--color-accent-rgb),0.08)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-primary)]"
      >
        <span className={LABEL} style={{ ...LABEL_STYLE, color: "var(--color-accent)" }}>
          {strings.sourcesTitle}
        </span>
        <span className={LABEL} style={LABEL_STYLE}>
          {rows.length}
        </span>
      </button>
      {!collapsed && (
        <ul className="flex flex-col gap-0.5 px-1 pb-1.5">
          {rows.map((r) => (
            <li key={`${r.path}#${r.anchor ?? ""}`}>
              <button
                type="button"
                onClick={() => openFile(r.path, r.anchor)}
                className="flex w-full min-w-0 items-center gap-1.5 rounded px-1.5 py-1 text-left transition-colors hover:bg-[rgba(var(--color-primary-rgb),0.07)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-primary)]"
              >
                <span className="kb-chip shrink-0">[{r.index}]</span>
                <span className="min-w-0 flex-1 truncate text-control text-[var(--color-text-secondary)]">
                  {r.docTitle}
                  {r.sectionTitle && (
                    <span className="text-[var(--color-text-tertiary)]"> › {r.sectionTitle}</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx vitest run tests/components/kb/kb-sources-strip.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add components/kb/kb-sources-strip.tsx tests/components/kb/kb-sources-strip.test.tsx
git commit -m "feat(kb): KbSourcesStrip — auto-shown latest-answer sources

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: `useKbPeek` hook

Open/close intent (hover + focus, with delays), lazy fetch of the doc text via the existing `/kb/file` endpoint, and a module-level per-path cache. Disabled on coarse pointers.

**Files:**
- Create: `lib/kb/use-kb-peek.ts`
- Test: `tests/lib/kb/use-kb-peek.test.ts`

**Interfaces:**
- Consumes: `KbFile` from `@/lib/kb/manifest`; `PeekTarget` from `@/lib/kb/peek-extract`.
- Produces:
  - `type PeekState = { status: "loading" } | { status: "ready"; text: string } | { status: "error" }`
  - `type PeekActive = { file: KbFile; target: PeekTarget; rect: DOMRect; state: PeekState }`
  - `function useKbPeek(apiBasePath: string, lang: string): { active: PeekActive | null; show: (el: HTMLElement, file: KbFile, target: PeekTarget) => void; hide: () => void }`
  - `function clearPeekCache(): void` (test-only reset)
  - Constant `OPEN_DELAY = 400`, `CLOSE_DELAY = 120` (exported for the wiring test).

- [ ] **Step 1: Write the failing test**

```ts
/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useKbPeek, clearPeekCache, OPEN_DELAY } from "@/lib/kb/use-kb-peek";
import type { KbFile } from "@/lib/kb/manifest";

const FILE: KbFile = { path: "experience/ion.md", title: "ION", type: "md" };

function mockHover(none: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockReturnValue({ matches: none, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  });
}

function el(): HTMLElement {
  const e = document.createElement("button");
  e.getBoundingClientRect = () => ({ top: 10, left: 100, right: 200, bottom: 30, width: 100, height: 20, x: 100, y: 10, toJSON: () => ({}) }) as DOMRect;
  return e;
}

beforeEach(() => {
  clearPeekCache();
  vi.useFakeTimers();
  mockHover(false);
});
afterEach(() => vi.useRealTimers());

describe("useKbPeek", () => {
  it("opens after OPEN_DELAY: loading then ready from the fetched text", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve("# ION\n\nbody") });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useKbPeek("/api", "en"));
    act(() => result.current.show(el(), FILE, { kind: "doc" }));
    expect(result.current.active).toBeNull(); // not yet — within the delay

    await act(async () => {
      vi.advanceTimersByTime(OPEN_DELAY);
    });
    expect(result.current.active?.state.status).toBe("loading");

    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.active?.state).toEqual({ status: "ready", text: "# ION\n\nbody" });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
  });

  it("does nothing on coarse pointers (hover: none)", () => {
    mockHover(true);
    const { result } = renderHook(() => useKbPeek("/api", "en"));
    act(() => result.current.show(el(), FILE, { kind: "doc" }));
    act(() => vi.advanceTimersByTime(OPEN_DELAY));
    expect(result.current.active).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx vitest run tests/lib/kb/use-kb-peek.test.ts`
Expected: FAIL — cannot resolve `@/lib/kb/use-kb-peek`.

- [ ] **Step 3: Implement**

```ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { KbFile } from "@/lib/kb/manifest";
import type { PeekTarget } from "@/lib/kb/peek-extract";

export const OPEN_DELAY = 400;
export const CLOSE_DELAY = 120;

export type PeekState =
  | { status: "loading" }
  | { status: "ready"; text: string }
  | { status: "error" };

export type PeekActive = { file: KbFile; target: PeekTarget; rect: DOMRect; state: PeekState };

const cache = new Map<string, Promise<string>>();

/** Test-only: drop the module-level doc-text cache. */
export function clearPeekCache() {
  cache.clear();
}

function fetchDocText(apiBasePath: string, path: string, lang: string): Promise<string> {
  const key = `${apiBasePath}|${lang}|${path}`;
  let p = cache.get(key);
  if (!p) {
    p = fetch(`${apiBasePath}/kb/file?path=${encodeURIComponent(path)}&lang=${lang}`)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error("peek load failed"))));
    p.catch(() => cache.delete(key)); // don't cache failures
    cache.set(key, p);
  }
  return p;
}

function coarsePointer(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(hover: none)").matches === true;
}

/** Hover/focus-intent peek controller. Only `md`/`yaml` docs peek; coarse
 * pointers are no-ops (tap-to-open is unchanged). */
export function useKbPeek(apiBasePath: string, lang: string) {
  const [active, setActive] = useState<PeekActive | null>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const token = useRef(0); // guards against a stale fetch resolving after re-show

  const clearTimers = () => {
    if (openTimer.current) clearTimeout(openTimer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    openTimer.current = closeTimer.current = null;
  };

  const hide = useCallback(() => {
    if (openTimer.current) clearTimeout(openTimer.current);
    openTimer.current = null;
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      token.current++;
      setActive(null);
    }, CLOSE_DELAY);
  }, []);

  const show = useCallback(
    (el: HTMLElement, file: KbFile, target: PeekTarget) => {
      if (coarsePointer()) return;
      if (file.type !== "md" && file.type !== "yaml") return;
      clearTimers();
      const rect = el.getBoundingClientRect();
      openTimer.current = setTimeout(() => {
        const mine = ++token.current;
        setActive({ file, target, rect, state: { status: "loading" } });
        fetchDocText(apiBasePath, file.path, lang).then(
          (text) => {
            if (token.current === mine) {
              setActive((a) => (a ? { ...a, state: { status: "ready", text } } : a));
            }
          },
          () => {
            if (token.current === mine) {
              setActive((a) => (a ? { ...a, state: { status: "error" } } : a));
            }
          },
        );
      }, OPEN_DELAY);
    },
    [apiBasePath, lang],
  );

  useEffect(() => clearTimers, []);

  return { active, show, hide };
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx vitest run tests/lib/kb/use-kb-peek.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/kb/use-kb-peek.ts tests/lib/kb/use-kb-peek.test.ts
git commit -m "feat(kb): useKbPeek — hover/focus intent + cached doc-text fetch

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: `KbPeek` card component

Presentational floating card driven by `PeekActive`. Renders the excerpt (via `extractExcerpt`) plus the doc title/meta, positioned to the left of the panel. Loading → skeleton; error → nothing.

**Files:**
- Create: `components/kb/kb-peek.tsx`
- Test: `tests/components/kb/kb-peek.test.tsx`

**Interfaces:**
- Consumes: `PeekActive` (Task 7); `extractExcerpt` (Task 2); `metaSubtitle` from `@/lib/kb/meta-format`; `useKb()` → `strings`.
- Produces: `function KbPeek({ active }: { active: PeekActive | null }): JSX.Element | null`.

- [ ] **Step 1: Write the failing test**

```tsx
/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { KbPeek } from "@/components/kb/kb-peek";
import { useKb } from "@/components/kb/kb-context";
import { makeKbContext } from "@/tests/helpers/kb-fixtures";
import type { PeekActive } from "@/lib/kb/use-kb-peek";
import type { KbFile } from "@/lib/kb/manifest";

vi.mock("@/components/kb/kb-context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/kb/kb-context")>();
  return { ...actual, useKb: vi.fn() };
});

const FILE: KbFile = { path: "experience/ion.md", title: "ION", type: "md" };
const rect = { top: 10, left: 100, right: 200, bottom: 30, width: 100, height: 20, x: 100, y: 10, toJSON: () => ({}) } as DOMRect;

beforeEach(() => {
  vi.mocked(useKb).mockReset();
  vi.mocked(useKb).mockReturnValue(makeKbContext());
});

describe("KbPeek", () => {
  it("renders nothing when inactive", () => {
    const { container } = render(<KbPeek active={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("shows the loading label while loading", () => {
    const active: PeekActive = { file: FILE, target: { kind: "doc" }, rect, state: { status: "loading" } };
    render(<KbPeek active={active} />);
    expect(screen.getByText("Loading preview…")).toBeInTheDocument();
  });

  it("shows the title and the extracted excerpt when ready", () => {
    const active: PeekActive = {
      file: FILE,
      target: { kind: "doc" },
      rect,
      state: { status: "ready", text: "# ION\n\nBattery analytics for fleets." },
    };
    render(<KbPeek active={active} />);
    expect(screen.getByText("ION")).toBeInTheDocument();
    expect(screen.getByText("Battery analytics for fleets.")).toBeInTheDocument();
  });

  it("renders nothing on error", () => {
    const active: PeekActive = { file: FILE, target: { kind: "doc" }, rect, state: { status: "error" } };
    const { container } = render(<KbPeek active={active} />);
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx vitest run tests/components/kb/kb-peek.test.tsx`
Expected: FAIL — cannot resolve `@/components/kb/kb-peek`.

- [ ] **Step 3: Implement**

```tsx
"use client";

import { useKb } from "@/components/kb/kb-context";
import { extractExcerpt } from "@/lib/kb/peek-extract";
import { metaSubtitle } from "@/lib/kb/meta-format";
import type { PeekActive } from "@/lib/kb/use-kb-peek";

/** Floating preview card for a hovered/focused KB row. Positioned to the LEFT
 * of the panel (the panel hugs the right screen edge), clamped to the viewport.
 * Error state renders nothing (silent). */
export function KbPeek({ active }: { active: PeekActive | null }) {
  const { strings } = useKb();
  if (!active || active.state.status === "error") return null;

  const { file, target, rect, state } = active;
  const subtitle = file.meta ? metaSubtitle(file.meta) : null;

  // Anchor the card to the left of the row, vertically aligned to it; clamp the
  // top so a near-bottom row's card stays on screen.
  const width = 300;
  const left = Math.max(8, rect.left - width - 8);
  const top = Math.min(rect.top, typeof window !== "undefined" ? window.innerHeight - 140 : rect.top);

  return (
    <div
      role="tooltip"
      style={{ position: "fixed", top, left, width }}
      className="z-50 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-3 shadow-lg"
    >
      <p className="truncate text-control font-medium text-[var(--color-text-primary)]">{file.title}</p>
      {subtitle && (
        <p className="truncate text-2xs text-[var(--color-text-tertiary)]">{subtitle}</p>
      )}
      <div className="mt-1.5 border-t border-[var(--color-border)] pt-1.5">
        {state.status === "loading" ? (
          <p className="text-xs text-[var(--color-text-tertiary)]">{strings.peekLoading}</p>
        ) : (
          <p className="line-clamp-4 text-xs leading-relaxed text-[var(--color-text-secondary)]">
            {extractExcerpt(state.text, target)}
          </p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx vitest run tests/components/kb/kb-peek.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add components/kb/kb-peek.tsx tests/components/kb/kb-peek.test.tsx
git commit -m "feat(kb): KbPeek — floating doc/section preview card

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Wire peek into the tree rows

Instantiate `useKbPeek` in `KbTree`, pass `show`/`hide` through the row context, attach them to doc and section rows (mouse + focus), and render one `<KbPeek>` at the tree root.

**Files:**
- Modify: `components/kb/kb-tree.tsx`
- Test: `tests/components/kb/kb-tree-peek.test.tsx`

**Interfaces:**
- Consumes: `useKbPeek`, `PeekActive` (Task 7); `KbPeek` (Task 8); `PeekTarget` (Task 2).
- Adds to the internal `RowCtx`: `peekShow: (el: HTMLElement, node: KbTreeNode) => void` and `peekHide: () => void`.

- [ ] **Step 1: Write the failing test**

This test mocks `useKbPeek` so it can assert the row wires hover → `show` with the right file + target. Note `useKbPeek` is imported by `kb-tree.tsx` from `@/lib/kb/use-kb-peek`.

```tsx
/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KbTree } from "@/components/kb/kb-tree";
import { useKb } from "@/components/kb/kb-context";
import * as peek from "@/lib/kb/use-kb-peek";
import type { KbFile } from "@/lib/kb/manifest";
import { makeKbContext } from "@/tests/helpers/kb-fixtures";

vi.mock("@/components/kb/kb-context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/kb/kb-context")>();
  return { ...actual, useKb: vi.fn() };
});

const FILES: KbFile[] = [{ path: "experience/2021-ion.md", title: "2021 — ION Energy", type: "md" }];

beforeEach(() => {
  vi.mocked(useKb).mockReset();
  vi.mocked(useKb).mockReturnValue(makeKbContext({ manifest: FILES, groups: [{ name: "experience" }] }));
  sessionStorage.clear();
});

describe("KbTree — peek wiring", () => {
  it("hovering a doc row calls show with the file and a doc target", async () => {
    const show = vi.fn();
    vi.spyOn(peek, "useKbPeek").mockReturnValue({ active: null, show, hide: vi.fn() });
    const user = userEvent.setup();

    render(<KbTree manifest={FILES} citedRefs={[]} onOpen={vi.fn()} />);
    await user.hover(screen.getByRole("button", { name: /2021 — ION Energy/ }));

    expect(show).toHaveBeenCalledTimes(1);
    const [, file, target] = show.mock.calls[0];
    expect(file.path).toBe("experience/2021-ion.md");
    expect(target).toEqual({ kind: "doc" });
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx vitest run tests/components/kb/kb-tree-peek.test.tsx`
Expected: FAIL — `show` not called (no wiring yet).

- [ ] **Step 3: Implement the wiring**

In `components/kb/kb-tree.tsx`:

Add imports near the top:
```ts
import { useKbPeek } from "@/lib/kb/use-kb-peek";
import { KbPeek } from "@/components/kb/kb-peek";
import type { PeekTarget } from "@/lib/kb/peek-extract";
```

Add two fields to the `RowCtx` type:
```ts
  peekShow: (el: HTMLElement, node: KbTreeNode) => void;
  peekHide: () => void;
```

On the **doc** main open-file `<button>` (the one with `onClick={() => ctx.onOpen(node.path!, null)}`), add handlers:
```tsx
            onMouseEnter={(e) => ctx.peekShow(e.currentTarget, node)}
            onMouseLeave={ctx.peekHide}
            onFocus={(e) => ctx.peekShow(e.currentTarget, node)}
            onBlur={ctx.peekHide}
```

On the **section** `sectionButton` `<button>` (the one with `onClick={() => ctx.onOpen(node.path!, node.anchor ?? null)}`), add the same four handlers.

In the `KbTree` component body, instantiate the hook and build the show wrapper (after the existing `useKbTreeState(...)` call):
```ts
  const { active: peekActive, show: rawShow, hide: peekHide } = useKbPeek(apiBasePath, lang);
  const peekShow = useCallback(
    (el: HTMLElement, node: KbTreeNode) => {
      if (!node.path) return;
      const target: PeekTarget = node.kind === "section" && node.anchor
        ? { kind: "section", slug: node.anchor }
        : { kind: "doc" };
      const file = files.find((f) => f.path === node.path);
      if (file) rawShow(el, file, target);
    },
    [files, rawShow],
  );
```

Add `peekShow` and `peekHide` to the `ctx` object literal.

Render the card once — change the outermost returned wrapper so it includes the card after the tree content (keep the existing `containerRef`/`onKeyDown` wrapper; add a sibling):
```tsx
  return (
    <>
      <div ref={containerRef} className="flex flex-col gap-2" onKeyDown={containerKeyDown}>
        {/* …existing filter row removed in Task 10; tree content unchanged here… */}
      </div>
      <KbPeek active={peekActive} />
    </>
  );
```

(`lang` and `apiBasePath` already come from `useKb()` at the top of `KbTree`; `useCallback` is already imported.)

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx vitest run tests/components/kb/kb-tree-peek.test.tsx`
Expected: PASS.

- [ ] **Step 5: Regression — existing tree tests still green**

Run: `npx vitest run tests/components/kb/kb-tree-chips.test.tsx`
Expected: PASS (peek handlers are additive; accessible names unchanged).

- [ ] **Step 6: Commit**

```bash
git add components/kb/kb-tree.tsx tests/components/kb/kb-tree-peek.test.tsx
git commit -m "feat(kb): wire hover/focus peek into doc + section rows

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Header refactor — cited pill, density toggle, full-width filter, mount Sources strip

Lift `filter`/`lens` out of `useKbTreeState` up to `KbPanel`; render the cited pill + density toggle in the band; move the filter to its own full-width row; mount `KbSourcesStrip` above the tree. `KbTree` accepts `filter`/`lens` as optional props (default off, so the existing direct-render tests keep working) and no longer renders the filter row or lens button.

**Files:**
- Modify: `components/kb/use-kb-tree-state.ts`
- Modify: `components/kb/kb-tree.tsx`
- Modify: `components/kb/kb-panel.tsx`
- Test: `tests/components/kb/kb-panel-header.test.tsx`

**Interfaces:**
- `useKbTreeState` return type loses `filter`, `setFilter`, `lens`, `setLens`; keeps `{ isExpanded, toggle, pulseId }`.
- `KbTree` props gain: `filter?: string` (default `""`), `lens?: boolean` (default `false`). It still owns `lensCount` derivation only if needed; the lens *button* moves to `KbPanel`, but `KbPanel` needs `lensCount` to disable the pill — see below.
- `KbPanel` owns `const [filter, setFilter] = useState("")` and `const [lens, setLens] = useState(false)`, plus `useKbDensity()`.

- [ ] **Step 1: Write the failing test**

```tsx
/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KbPanel } from "@/components/kb/kb-panel";
import { useKb } from "@/components/kb/kb-context";
import type { KbFile } from "@/lib/kb/manifest";
import type { CitedRef } from "@/lib/kb/cited-paths";
import { makeKbContext } from "@/tests/helpers/kb-fixtures";

vi.mock("@/components/kb/kb-context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/kb/kb-context")>();
  return { ...actual, useKb: vi.fn() };
});

const FILES: KbFile[] = [
  { path: "experience/2021-ion.md", title: "2021 — ION Energy", type: "md" },
  { path: "projects/graybox.md", title: "Graybox", type: "md" },
];

function ctx(overrides = {}) {
  return makeKbContext({
    manifest: FILES,
    groups: [{ name: "experience" }, { name: "projects" }],
    ...overrides,
  });
}

beforeEach(() => {
  vi.mocked(useKb).mockReset();
  localStorage.clear();
  sessionStorage.clear();
});

describe("KbPanel header", () => {
  it("renders the filter input as its own full-width row", () => {
    vi.mocked(useKb).mockReturnValue(ctx());
    render(<KbPanel />);
    expect(screen.getByPlaceholderText("Filter…")).toBeInTheDocument();
  });

  it("cited pill is disabled with no citations and toggles the lens when cited", async () => {
    const refs: CitedRef[] = [
      { path: "experience/2021-ion.md", anchor: null, index: 1, messageId: "m1" },
    ];
    vi.mocked(useKb).mockReturnValue(ctx({ citedRefs: refs }));
    const user = userEvent.setup();
    render(<KbPanel />);

    // Both collections visible initially.
    expect(screen.getByText("Projects")).toBeInTheDocument();

    const pill = screen.getByRole("button", { name: /referenced/i });
    expect(pill).toHaveAttribute("aria-pressed", "false");
    await user.click(pill);
    expect(pill).toHaveAttribute("aria-pressed", "true");

    // Lens on → the non-cited "Projects" collection is pruned away.
    expect(screen.queryByText("Projects")).toBeNull();
    expect(screen.getByText("Experience")).toBeInTheDocument();
  });

  it("density toggle flips data-kb-density and persists", async () => {
    vi.mocked(useKb).mockReturnValue(ctx());
    const user = userEvent.setup();
    const { container } = render(<KbPanel />);

    const scroll = container.querySelector("[data-kb-density]")!;
    expect(scroll).toHaveAttribute("data-kb-density", "compact");

    await user.click(screen.getByRole("button", { name: "Row spacing" }));
    expect(scroll).toHaveAttribute("data-kb-density", "comfortable");
    expect(localStorage.getItem("queritae:kbDensity")).toBe("comfortable");
  });

  it("mounts the Sources strip above the tree when the latest answer cited something", () => {
    vi.mocked(useKb).mockReturnValue(
      ctx({
        latestAnswer: {
          messageId: "m1",
          refs: [{ path: "experience/2021-ion.md", anchor: null, index: 1, messageId: "m1" }],
        },
      }),
    );
    render(<KbPanel />);
    expect(screen.getByText("Sources · this answer")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx vitest run tests/components/kb/kb-panel-header.test.tsx`
Expected: FAIL — the pill / `data-kb-density` / Sources strip don't exist in `KbPanel` yet.

- [ ] **Step 3: Slim `useKbTreeState`**

In `components/kb/use-kb-tree-state.ts`:
- Remove the `filter`/`setFilter` and `lens`/`setLens` `useState` lines.
- Remove `filter` and `lens` from the returned object. Final `return`:
```ts
  return { isExpanded, toggle, pulseId };
```
(Leave the pulse/auto-reveal logic untouched — it doesn't reference filter/lens.)

- [ ] **Step 4: Make `KbTree` accept `filter`/`lens` as props and drop its filter row**

In `components/kb/kb-tree.tsx`:

Change the component signature to accept the new props and remove `filter`/`lens` from the `useKbTreeState` destructure:
```ts
export function KbTree({
  manifest,
  citedRefs,
  onOpen,
  filter = "",
  lens = false,
}: {
  manifest: KbFile[];
  citedRefs: CitedRef[];
  onOpen: (path: string, anchor?: string | null) => void;
  filter?: string;
  lens?: boolean;
}) {
```
```ts
  const { isExpanded, toggle, pulseId } = useKbTreeState({
    storageKey: `queritae:kbTree:${apiBasePath}`,
    files,
    citedRefs,
    groupNames,
    seenAutoReveal,
  });
```
Delete the entire `{/* Filter row: text input + cited-lens toggle */}` block (the `<div className="flex gap-2">…</div>` containing the `<input>` and the lens `<button>`) from the returned JSX. Keep the pinned rows, the tree rows, and the empty/no-match states.

Remove the now-unused `filterRef`, the `/`-focus branch inside `containerKeyDown` (the `if (e.key === "/")` block), the `setFilter`/`setLens`/`lensCount` references, and the `strings.filterPlaceholder`/`referencedLens*` usages from `KbTree`. Keep the `ArrowDown`/`ArrowUp` row navigation in `containerKeyDown`. `searchMode` stays: `const searchMode = filter.trim() !== "" || lens;` (now from props).

- [ ] **Step 5: Rebuild the `KbPanel` tree-view header + body**

In `components/kb/kb-panel.tsx`:

Add imports:
```ts
import { useState } from "react";
import { KbTree } from "@/components/kb/kb-tree";
import { KbSourcesStrip } from "@/components/kb/kb-sources-strip";
import { useKbDensity } from "@/lib/kb/use-kb-density";
import { cn } from "@/lib/utils";
```
(Keep existing imports; `KbTree` is already imported — don't duplicate.)

Inside `KbPanel`, after the existing `useKb()` destructure (add `citedRefs` is already destructured; ensure `manifest`, `citedRefs`, `openFile`, `strings` are available), add view state:
```ts
  const [filter, setFilter] = useState("");
  const [lens, setLens] = useState(false);
  const [density, toggleDensity] = useKbDensity();

  const realFiles = manifest.filter((f) => !f.path.startsWith("_virtual/"));
  const lensCount = citedRefs.filter((r) => realFiles.some((f) => f.path === r.path)).length;
```

Constants for the band labels (top of file, next to `BAND`):
```ts
const LABEL_STYLE = { letterSpacing: "0.24em" };
```

The current `KbPanel` has the viewer early-return, then a single `return` whose band and body use `isNotInKb` ternaries. Split that single return into **two**: first an explicit early return for the not-in-KB case (reproducing today's behaviour), then the tree-view return. Replace everything from `const isNotInKb = …` to the end of the function with:

```tsx
  // openTarget is set but the path is missing from the manifest — dead-end.
  if (openTarget !== null && openFileEntry === null) {
    return (
      <aside className="flex h-full flex-col overflow-hidden">
        <div className={BAND}>
          <button
            type="button"
            onClick={closeFile}
            aria-label={strings.backToList}
            className="shrink-0 whitespace-nowrap font-mono text-2xs uppercase text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-accent)]"
            style={{ letterSpacing: "0.2em" }}
          >
            ‹ {strings.back}
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4">
          <p className="text-xs text-[var(--color-text-tertiary)]">{strings.notInKb}</p>
        </div>
      </aside>
    );
  }

  // Tree view (openTarget === null).
```

Then the tree-view `return` (the final statement of the function) is:

```tsx
  return (
    <aside className="flex h-full flex-col overflow-hidden">
      <div className={BAND}>
        <span
          className="font-mono text-2xs uppercase text-[var(--color-primary)]"
          style={{ letterSpacing: "0.32em" }}
        >
          {strings.title}
        </span>
        <span className="font-mono text-2xs uppercase text-[var(--color-text-tertiary)]">
          {manifest.length}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            aria-pressed={lens}
            aria-label={strings.referencedLensAria}
            disabled={lensCount === 0}
            onClick={() => setLens((v) => !v)}
            className={cn(
              "flex shrink-0 items-center gap-1 rounded border px-2 py-0.5 font-mono text-2xs uppercase transition-colors",
              lens
                ? "border-[rgba(var(--color-accent-rgb),0.6)] bg-[rgba(var(--color-accent-rgb),0.1)] text-[var(--color-accent)]"
                : "border-[var(--color-border)] text-[var(--color-text-tertiary)] hover:border-[var(--color-border-hover)]",
              lensCount === 0 && "cursor-not-allowed opacity-40",
            )}
            style={LABEL_STYLE}
          >
            <span aria-hidden>◆</span> {lensCount} {strings.referencedLens}
          </button>
          <button
            type="button"
            aria-label={strings.densityLabel}
            aria-pressed={density === "comfortable"}
            onClick={toggleDensity}
            className="shrink-0 rounded border border-[var(--color-border)] p-1 text-[var(--color-text-tertiary)] transition-colors hover:border-[var(--color-border-hover)] hover:text-[var(--color-text-secondary)]"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              {density === "comfortable" ? (
                <>
                  <path d="M4 7h16M4 12h16M4 17h16" />
                </>
              ) : (
                <>
                  <path d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </>
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Full-width filter row */}
      <div className="shrink-0 border-b border-[var(--color-border)] px-4 py-2">
        <div className="flex items-center gap-2 rounded border border-[var(--color-border)] bg-[var(--color-card)] px-2">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden className="shrink-0 text-[var(--color-text-tertiary)]">
            <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={strings.filterPlaceholder}
            aria-label={strings.filterPlaceholder}
            onKeyDown={(e) => {
              if (e.key === "Escape" && filter !== "") {
                e.stopPropagation();
                setFilter("");
              }
            }}
            className="flex-1 bg-transparent py-1.5 text-xs text-[var(--color-text-secondary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none"
          />
        </div>
      </div>

      <div
        ref={scrollRef}
        data-kb-density={density}
        className="min-h-0 flex-1 overflow-auto p-4"
        onScroll={(e) => {
          try {
            window.sessionStorage.setItem(scrollKey, String(Math.round(e.currentTarget.scrollTop)));
          } catch {
            /* storage unavailable */
          }
        }}
      >
        <KbSourcesStrip />
        <KbTree manifest={manifest} citedRefs={citedRefs} onOpen={openFile} filter={filter} lens={lens} />
      </div>
    </aside>
  );
```

Leave the `openFileEntry` (viewer) and `isNotInKb` branches exactly as they are — the pill/density/filter/strip render only in the tree view. (The `openTarget ? <p>{strings.notInKb}</p> : …` body that previously lived in the scroll area is now superseded by the tree-view return above; the `isNotInKb` band branch still returns its own `<aside>` earlier in the function, so keep that intact and ensure the new tree-view return is the final `return`.)

- [ ] **Step 6: Run the new + regression tests**

Run: `npx vitest run tests/components/kb/kb-panel-header.test.tsx tests/components/kb/kb-panel-not-in-kb.test.tsx tests/components/kb/use-kb-tree-state.test.ts tests/components/kb/kb-tree-chips.test.tsx`
Expected: PASS — new header behaviours green; the not-in-kb branch, the tree-state hook (only asserts `pulseId`), and the chip tests (KbTree renders fine with default `filter`/`lens`) all still green.

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: PASS — `useKbTreeState` callers updated, `KbTree` props optional.

- [ ] **Step 8: Commit**

```bash
git add components/kb/use-kb-tree-state.ts components/kb/kb-tree.tsx components/kb/kb-panel.tsx tests/components/kb/kb-panel-header.test.tsx
git commit -m "feat(kb): header cited-pill + density toggle + full-width filter + sources strip

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Citation visuals — indent guides, trail rail, glyph swap, chip pill, pinpoint tint

Final visual pass on the tree rows: per-row indent guide rails, an accent "trail rail" on expanded cited branches, the `KbFileGlyph` swap for the text type badge, a cleaner chip pill, and the pinpoint tint kept only on the exact cited node. The collapsed-state dot is unchanged.

**Files:**
- Modify: `components/kb/kb-tree.tsx`
- Modify: `app/globals.css`
- Test: `tests/components/kb/kb-tree-visuals.test.tsx`

**Interfaces:**
- Consumes: `KbFileGlyph` (Task 4).
- Internal helper component `GuideRails` (in `kb-tree.tsx`): renders `depth` faint vertical segments; the segment at `trailLevel` (when set) renders in accent. The cited doc passes `trailLevel = depth` to its visible descendants.

- [ ] **Step 1: Write the failing test**

```tsx
/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { KbTree } from "@/components/kb/kb-tree";
import { useKb } from "@/components/kb/kb-context";
import type { KbFile } from "@/lib/kb/manifest";
import type { CitedRef } from "@/lib/kb/cited-paths";
import { makeKbContext } from "@/tests/helpers/kb-fixtures";

vi.mock("@/components/kb/kb-context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/kb/kb-context")>();
  return { ...actual, useKb: vi.fn() };
});

const FILES: KbFile[] = [
  { path: "experience/2021-ion.md", title: "2021 — ION Energy", type: "md" },
  { path: "projects/spec.pdf", title: "Spec", type: "pdf" },
];

function ctx(overrides = {}) {
  return makeKbContext({ manifest: FILES, groups: [{ name: "experience" }, { name: "projects" }], ...overrides });
}

beforeEach(() => {
  vi.mocked(useKb).mockReset();
  sessionStorage.clear();
});

describe("KbTree — visuals", () => {
  it("shows a type glyph for a non-md doc and none for markdown", () => {
    vi.mocked(useKb).mockReturnValue(ctx());
    const { container } = render(<KbTree manifest={FILES} citedRefs={[]} onOpen={vi.fn()} />);
    expect(container.querySelector('[data-kb-glyph="pdf"]')).not.toBeNull();
    expect(container.querySelector('[data-kb-glyph="md"]')).toBeNull();
  });

  it("an expanded cited doc branch is marked with the trail rail", () => {
    const refs: CitedRef[] = [
      { path: "experience/2021-ion.md", anchor: null, index: 1, messageId: "m1" },
    ];
    const { container } = render(<KbTree manifest={FILES} citedRefs={refs} onOpen={vi.fn()} />);
    // The cited doc's row container carries the trail marker.
    expect(container.querySelector("[data-kb-trail]")).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx vitest run tests/components/kb/kb-tree-visuals.test.tsx`
Expected: FAIL — no `data-kb-glyph`/`data-kb-trail` in the current markup.

- [ ] **Step 3: Add the `GuideRails` helper and swap the badge/chip/tint**

In `components/kb/kb-tree.tsx`:

Import the glyph:
```ts
import { KbFileGlyph } from "@/components/kb/kb-file-glyph";
```

Add the helper near `Chevron`:
```tsx
/** Faint vertical indent guides, one per ancestor level. The segment at
 * `trailLevel` (the cited branch's indent) renders in accent — the trail rail.
 * Each row draws its own segments; stacked rows form continuous lines. */
function GuideRails({ depth, trailLevel }: { depth: number; trailLevel: number | null }) {
  if (depth === 0 && trailLevel === null) return null;
  const levels = Array.from({ length: depth }, (_, i) => i);
  return (
    <>
      {levels.map((i) => (
        <span
          key={i}
          aria-hidden
          data-kb-trail={i === trailLevel ? "" : undefined}
          className="pointer-events-none absolute top-0 bottom-0 w-px"
          style={{
            left: i * 14 + 11,
            background: i === trailLevel
              ? "var(--color-accent)"
              : "rgba(var(--color-text-primary-rgb), 0.08)",
            width: i === trailLevel ? 2 : 1,
          }}
        />
      ))}
    </>
  );
}
```

Thread `trailLevel` through the row context. Add to `RowCtx`:
```ts
  /** Indent level of the nearest enclosing cited+open doc, or null. */
  trailLevel?: number | null;
```

In `Row`, compute the trail level passed to descendants and render guides. At the top of `Row`:
```ts
  const trailLevel = ctx.trailLevel ?? null;
  // A cited+open doc starts a trail at its own depth for its descendants and itself.
  const startsTrail = node.kind === "doc" && open && (node.chips.length > 0 || node.dot);
  const selfTrail = startsTrail ? depth : trailLevel;
  const childCtx: RowCtx = startsTrail ? { ...ctx, trailLevel: depth } : ctx;
```
- Make each row's outer element `relative` and render `<GuideRails depth={depth} trailLevel={selfTrail} />` as its first child. For the `collection`/`folder` button, the `doc` container `<div>`, and the `section` row, add `className="… relative"` and insert the rails before the existing content.
- Replace `{open && node.children.map((c) => <Row key={c.id} node={c} depth={depth + 1} ctx={ctx} />)}` with `ctx` → `childCtx` in all three kinds so descendants inherit the trail.

Swap the type badge: replace the doc `typeBadge` span definition
```tsx
    const typeBadge = (
      <span className="ml-1 shrink-0 font-mono text-3xs uppercase text-[var(--color-text-tertiary)]" style={{ letterSpacing: "0.16em" }}>
        {node.fileType}
      </span>
    );
```
with
```tsx
    const typeBadge = <KbFileGlyph type={node.fileType!} className="ml-1" />;
```
(`KbFileGlyph` returns `null` for `md`, so markdown rows render no badge node.)

Pinned rows (the `_virtual/` block lower in `KbTree`): replace the trailing type `<span>` with `<KbFileGlyph type={f.type} />`.

Pinpoint tint: the existing `isCited && "bg-[rgba(var(--color-accent-rgb),0.06)]"` already tints only the node that itself carries chips — keep it as the pinpoint tint. The trail rail now provides the branch-level thread, so no change is needed here beyond confirming the tint stays on cited rows only (it does).

Chip pill: in `ChipButtons`, give chips a pill look (text stays `[n]` for the existing chip test). Change the chip `className` to:
```tsx
          className="kb-chip cursor-pointer rounded border border-[rgba(var(--color-accent-rgb),0.3)] bg-[rgba(var(--color-accent-rgb),0.1)] px-1 leading-tight transition-colors hover:bg-[rgba(var(--color-accent-rgb),0.2)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-primary)]"
```

- [ ] **Step 4: Confirm `--color-text-primary-rgb` exists for the guide color**

It is already defined in `app/globals.css` (`--color-text-primary-rgb: 228, 235, 245;` in dark, `12, 24, 36;` in light). No CSS change required for the guides. (No new keyframes needed.)

- [ ] **Step 5: Run the new + regression tests**

Run: `npx vitest run tests/components/kb/kb-tree-visuals.test.tsx tests/components/kb/kb-tree-chips.test.tsx tests/components/kb/kb-tree-peek.test.tsx`
Expected: PASS — glyph + trail markers present; chips still render `[1]` as sibling buttons; peek wiring intact.

- [ ] **Step 6: Full suite + typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS across the repo.

- [ ] **Step 7: Commit**

```bash
git add components/kb/kb-tree.tsx app/globals.css tests/components/kb/kb-tree-visuals.test.tsx
git commit -m "feat(kb): indent guides + citation trail rail + glyph/chip polish

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Final verification (after all tasks)

- [ ] `npm test` — full suite green.
- [ ] `npm run typecheck` — no type errors.
- [ ] `npm run build` — production build succeeds (catches client/server boundary issues).
- [ ] Manual smoke (dev server, desktop): ask a question that cites sources → Sources strip appears with the right rows and updates on the next answer; cited pill shows the count and toggles the lens; hover a doc/section row → peek card appears to the left after a beat; density toggle changes row spacing and survives reload; filter + `/`-focus behaviour (note: `/`-focus was removed in Task 10 — confirm whether to re-add it on the panel, see "Known follow-up").

## Known follow-up (not in scope)

Task 10 removes the `/`-to-focus-filter shortcut that lived on the tree container (the input moved to the panel). If keeping that shortcut is desired, re-add a keydown on the panel scroll container that focuses the filter input — a small, separate change. Flagged here so it's a deliberate decision, not a silent regression.

## Self-review notes

- **Spec coverage:** B header pill/filter → Task 10; C trail rail/dot/guides/chips → Task 11; D glyphs → Tasks 4 + 11; E sources strip + latestAnswer → Tasks 1, 3, 6, 10; F peek → Tasks 2, 7, 8, 9; G density → Tasks 5 + 10; i18n → Task 3; tests → every task. All covered.
- **Type consistency:** `LatestAnswer`, `PeekTarget`, `PeekActive`, `PeekState`, `KbDensity` are defined once and consumed by name in later tasks. `KbTree` props `filter`/`lens` are optional to preserve direct-render tests.
- **The `/`-focus removal** is the one deliberate behaviour drop, surfaced in "Known follow-up" rather than hidden.
