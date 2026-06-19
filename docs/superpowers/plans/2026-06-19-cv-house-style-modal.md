# CV House-Style Template + Modal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the buried, in-panel CV with a prominent top-bar button that opens a spectacular house-style CV in a dedicated modal carrying Download / Share / Print actions.

**Architecture:** The CV data pipeline (`loadCvKb` → `/api/.../cv` → `CvDocumentClient` → `CvDocumentView`) is unchanged. Work is confined to the presentation + entry-point layer: rewrite the renderer into one perfected house style, add a `CvModal`, promote the top-bar button, and retire the in-panel CV view. PDF stays the browser print path (path A); a server renderer is an explicit out-of-scope fast-follow.

**Tech Stack:** Next.js (App Router) · React · TypeScript · Tailwind (CSS variables for theming) · Vitest + @testing-library/react (jsdom) · pnpm.

## Global Constraints

- **Package manager:** `pnpm`. Full tests: `pnpm test` (`vitest run --passWithNoTests`). Targeted: `pnpm exec vitest run <file>`. Types: `pnpm typecheck`. Lint: `pnpm lint`.
- **Theming:** colors/fonts via design tokens only — `var(--color-*)`, `font-display`, `font-mono`. No hardcoded hex.
- **i18n:** every user-facing string lives in `lib/language.ts` for **both** `en` and `fr`; `KbStrings = UiStrings["kb"]` so the two locale objects must stay structurally identical, and the test stub `tests/helpers/kb-fixtures.ts:KB_STRINGS` must match the type.
- **Privacy invariant untouched:** do not modify `lib/kb/cv-config.ts` (`filterKbForCv`) or `lib/cv/load.ts`. The CV stays a projection of structured collections.
- **Data contract:** the `Kb` type (`lib/kb/loader.ts`) and `/api/.../cv` response `{ lang, kb }` are unchanged.
- **Commits:** one per task, on branch `feat/cv-house-style-modal` (already created; the design spec is its first commit).

---

## File Structure

| File | Responsibility | Task |
|------|----------------|------|
| `lib/cv/markdown.ts` (new) | Pure CV→markdown serializer + filename helper (moved out of the panel) | 1 |
| `tests/helpers/cv-fixtures.ts` (new) | Typed `makeKb()` factory for renderer/serializer tests | 1 |
| `components/cv/cv-document.tsx` (rewrite) | The one house-style renderer (screen + print) | 2 |
| `components/cv/print.css` (rewrite) | A4 print fidelity | 2 |
| `lib/language.ts` (edit) | Add `share` / `shareAria` strings (en + fr) | 3 |
| `tests/helpers/kb-fixtures.ts` (edit) | Add `share`/`shareAria` to `KB_STRINGS` | 3 |
| `components/cv/cv-modal.tsx` (new) | Dialog chrome + toolbar (Download/Share/Print); hosts `CvDocumentClient` | 3 |
| `components/app-top-bar.tsx` (edit) | Promote CV control to a prominent labeled pill | 4 |
| `components/home-shell.tsx` (edit) | Own `cvOpen`; mount `CvModal`; rewire `openCv` | 5 |
| `components/kb/kb-context.tsx` (edit) | Remove `CV_VIRTUAL_PATH` + synthetic CV manifest entry | 5 |
| `components/kb/kb-panel.tsx` (edit) | Remove the CV special-case branch | 5 |
| `components/cv/cv-panel-view.tsx` (delete) | Retired after helpers are relocated | 5 |
| `lib/kb/file-type.ts` (edit) | Drop the now-dead `"cv"` `KbFileType` member | 6 |
| `lib/kb/handlers.ts` (edit) | Drop the dead `entry.type === "cv"` branch | 6 |

---

### Task 1: Extract the CV markdown serializer to a pure, tested module

Moves `assembleCvMarkdown` / `cvFileSlug` (currently private inside `cv-panel-view.tsx`) into a reusable, unit-tested module, and adds a `cvDownloadFilename` helper. No behavior change; `cv-panel-view.tsx` keeps working by importing from the new module (it is deleted later in Task 5).

**Files:**
- Create: `lib/cv/markdown.ts`
- Create: `tests/helpers/cv-fixtures.ts`
- Create: `tests/lib/cv/markdown.test.ts`
- Modify: `components/cv/cv-panel-view.tsx` (replace local helpers with imports)

**Interfaces:**
- Produces:
  - `assembleCvMarkdown(kb: Kb, lang: UiLang): string`
  - `cvFileSlug(name: string): string`
  - `cvDownloadFilename(name: string, lang: UiLang): string` → `"<slug>-cv.md"` (en) or `"<slug>-cv.fr.md"` (fr)
  - `makeKb(overrides?: Partial<Kb>): Kb` (test helper)

- [ ] **Step 1: Write the typed `Kb` fixture factory**

Create `tests/helpers/cv-fixtures.ts`:

```ts
import type { Kb } from "@/lib/kb/loader";

/** A complete, schema-valid `Kb` for renderer/serializer tests. Override any
 * slice (e.g. `makeKb({ talks: [] })`) to exercise empty-section behavior. */
export function makeKb(overrides?: Partial<Kb>): Kb {
  return {
    profile: { name: "Ada Lovelace", headline: "Computing pioneer", location: "London" },
    publicContact: {
      email: "ada@example.com",
      links: { linkedin: "https://linkedin.com/in/ada", github: "https://github.com/ada" },
    },
    skills: {
      skills: [
        { name: "Analytical Engine", level: 5, years: 10 },
        { name: "Mathematics", level: 4, years: 20 },
      ],
    },
    education: {
      entries: [
        { institution: "Private tutoring", degree: "Mathematics", start: "1830-01", end: "1835-01" },
      ],
    },
    experience: [
      {
        slug: "1843-engine",
        relativePath: "experience/1843-engine.md",
        frontmatter: {
          company: "Analytical Engine Project",
          role: "Mathematician",
          start: "1843-01",
          end: "present",
          location: "London",
          summary: "Designed the first published algorithm.",
          highlights: ["Wrote the first algorithm intended for a machine."],
          stack: ["Bernoulli numbers"],
        },
        body: "- Body bullet one\n- Body bullet two",
      },
    ],
    projects: [
      {
        slug: "note-g",
        relativePath: "projects/note-g.md",
        frontmatter: {
          name: "Note G",
          year: 1843,
          url: "https://example.com/note-g",
          stack: ["Algorithm"],
          repos: [
            {
              name: "note-g",
              role: "author",
              url: "https://github.com/ada/note-g",
              visibility: "public",
              description: "The first algorithm.",
            },
          ],
        },
        body: "",
      },
    ],
    talks: [
      {
        slug: "engine-talk",
        relativePath: "talks/engine-talk.md",
        frontmatter: {
          title: "On the Analytical Engine",
          venue: "Royal Society",
          year: 1843,
          url: "https://example.com/talk",
        },
        body: "",
      },
    ],
    recommendations: [],
    ...overrides,
  };
}
```

- [ ] **Step 2: Write the failing serializer tests**

Create `tests/lib/cv/markdown.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { assembleCvMarkdown, cvFileSlug, cvDownloadFilename } from "@/lib/cv/markdown";
import { makeKb } from "../../helpers/cv-fixtures";

describe("assembleCvMarkdown", () => {
  it("renders the profile header and section headings", () => {
    const md = assembleCvMarkdown(makeKb(), "en");
    expect(md).toContain("# Ada Lovelace");
    expect(md).toContain("Computing pioneer");
    expect(md).toContain("## Experience");
    expect(md).toContain("### Mathematician · Analytical Engine Project");
    expect(md).toContain("## Education");
    expect(md).toContain("## Skills");
    expect(md).toContain("## Projects");
    expect(md).toContain("## Open source");
    expect(md).toContain("note-g");
  });

  it("uses curated highlights when present, body bullets otherwise", () => {
    const withHighlights = assembleCvMarkdown(makeKb(), "en");
    expect(withHighlights).toContain("- Wrote the first algorithm intended for a machine.");

    const kb = makeKb();
    kb.experience[0].frontmatter.highlights = undefined;
    const withBody = assembleCvMarkdown(kb, "en");
    expect(withBody).toContain("- Body bullet one");
  });

  it("localizes section headings for fr", () => {
    const md = assembleCvMarkdown(makeKb(), "fr");
    expect(md).toContain("## Expérience");
    expect(md).toContain("## Formation");
    expect(md).toContain("## Compétences");
    expect(md).toContain("## Projets");
  });
});

describe("cvFileSlug", () => {
  it("slugifies a name, stripping accents and punctuation", () => {
    expect(cvFileSlug("Ada Lovelace")).toBe("ada-lovelace");
    expect(cvFileSlug("Émile Zöla!")).toBe("emile-zola");
  });
  it("falls back to 'cv' for an empty result", () => {
    expect(cvFileSlug("!!!")).toBe("cv");
  });
});

describe("cvDownloadFilename", () => {
  it("appends .fr only for the French locale", () => {
    expect(cvDownloadFilename("Ada Lovelace", "en")).toBe("ada-lovelace-cv.md");
    expect(cvDownloadFilename("Ada Lovelace", "fr")).toBe("ada-lovelace-cv.fr.md");
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm exec vitest run tests/lib/cv/markdown.test.ts`
Expected: FAIL — `Cannot find module '@/lib/cv/markdown'`.

- [ ] **Step 4: Create the module (move helpers verbatim + add filename helper)**

Create `lib/cv/markdown.ts`. The bodies of `assembleCvMarkdown`, `cvFileSlug`, and the private `firstBulletList` are moved verbatim from `components/cv/cv-panel-view.tsx` (lines ~120–214); `cvDownloadFilename` is new and reuses `cvFileSlug`.

```ts
import type { Kb } from "@/lib/kb/loader";
import type { UiLang } from "@/lib/language";
import { allRepos } from "@/lib/kb/repos";

/** Lightweight CV → markdown serializer for copy/download. Mirrors the layout
 * of `CvDocumentView`: profile header, then each section as a `##` heading
 * with bullets. Deliberately compact so the clipboard copy reads cleanly. */
export function assembleCvMarkdown(kb: Kb, lang: UiLang): string {
  const lines: string[] = [];
  lines.push(`# ${kb.profile.name}`);
  lines.push("");
  lines.push(kb.profile.headline);
  if (kb.profile.location) lines.push(kb.profile.location);
  const contact: string[] = [];
  if (kb.publicContact.email) contact.push(kb.publicContact.email);
  if (kb.publicContact.links?.linkedin) contact.push(kb.publicContact.links.linkedin);
  if (kb.publicContact.links?.github) contact.push(kb.publicContact.links.github);
  if (contact.length > 0) lines.push(contact.join("  ·  "));
  lines.push("");

  const expLabel = lang === "fr" ? "Expérience" : "Experience";
  lines.push(`## ${expLabel}`);
  for (const e of kb.experience) {
    lines.push("");
    lines.push(`### ${e.frontmatter.role} · ${e.frontmatter.company}`);
    const period = `${e.frontmatter.start} – ${e.frontmatter.end}`;
    const loc = e.frontmatter.location ? ` · ${e.frontmatter.location}` : "";
    lines.push(`_${period}${loc}_`);
    if (e.frontmatter.summary) lines.push(e.frontmatter.summary);
    const bullets = e.frontmatter.highlights ?? firstBulletList(e.body, 6);
    for (const b of bullets) lines.push(`- ${b}`);
    if (e.frontmatter.stack?.length) lines.push(`*Stack: ${e.frontmatter.stack.join(", ")}*`);
  }

  if (kb.education.entries.length > 0) {
    lines.push("");
    lines.push(`## ${lang === "fr" ? "Formation" : "Education"}`);
    for (const ed of kb.education.entries) {
      lines.push(
        `- **${ed.degree}** · ${ed.institution} — ${ed.start} – ${ed.end}${ed.notes ? `. ${ed.notes}` : ""}`,
      );
    }
  }

  if (kb.skills.skills.length > 0) {
    lines.push("");
    lines.push(`## ${lang === "fr" ? "Compétences" : "Skills"}`);
    lines.push(kb.skills.skills.map((s) => s.name).join(" · "));
  }

  if (kb.projects.length > 0) {
    lines.push("");
    lines.push(`## ${lang === "fr" ? "Projets" : "Projects"}`);
    for (const p of kb.projects) {
      const url = p.frontmatter.url ? ` (${p.frontmatter.url})` : "";
      const year = p.frontmatter.year ? `, ${p.frontmatter.year}` : "";
      lines.push(`- **${p.frontmatter.name}**${url}${year}`);
    }
  }

  const repos = allRepos(kb);
  if (repos.length > 0) {
    lines.push("");
    lines.push(`## Open source`);
    for (const o of repos) {
      const url = o.url ? ` (${o.url})` : "";
      lines.push(`- **${o.name}**${url} — ${o.role}${o.description ? `: ${o.description}` : ""}`);
    }
  }

  return lines.join("\n");
}

/** Slugify a person's name for a download filename: "Ada Lovelace" → "ada-lovelace". */
export function cvFileSlug(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "cv";
}

/** Download filename for the CV markdown artifact, fr-suffixed for French. */
export function cvDownloadFilename(name: string, lang: UiLang): string {
  return `${cvFileSlug(name)}-cv${lang === "fr" ? ".fr" : ""}.md`;
}

function firstBulletList(body: string, max: number): string[] {
  const lines = body.split("\n");
  let inList = false;
  const out: string[] = [];
  for (const line of lines) {
    if (/^\s*[-*]\s+/.test(line)) {
      inList = true;
      out.push(line.replace(/^\s*[-*]\s+/, "").trim());
      if (out.length >= max) break;
    } else if (inList && line.trim() === "") {
      break;
    } else if (inList) {
      out[out.length - 1] += " " + line.trim();
    }
  }
  return out;
}
```

> Note: the original `cvFileSlug` used a literal combining-marks character class; `[̀-ͯ]` is the same range written portably.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm exec vitest run tests/lib/cv/markdown.test.ts`
Expected: PASS (all three describe blocks).

- [ ] **Step 6: Point `cv-panel-view.tsx` at the new module**

In `components/cv/cv-panel-view.tsx`: delete the local `assembleCvMarkdown`, `cvFileSlug`, and `firstBulletList` function definitions and the inline `a.download = ...` slug expression; import instead:

```ts
import { assembleCvMarkdown, cvDownloadFilename } from "@/lib/cv/markdown";
```

Replace the download filename line with:
```ts
a.download = cvDownloadFilename(kb.profile.name, lang);
```

- [ ] **Step 7: Verify the codebase still typechecks and tests pass**

Run: `pnpm typecheck && pnpm exec vitest run tests/lib/cv`
Expected: no type errors; markdown tests pass.

- [ ] **Step 8: Commit**

```bash
git add lib/cv/markdown.ts tests/helpers/cv-fixtures.ts tests/lib/cv/markdown.test.ts components/cv/cv-panel-view.tsx
git commit -m "refactor(cv): extract markdown serializer to lib/cv/markdown (tested)"
```

---

### Task 2: Rewrite `CvDocumentView` + `print.css` into the house style

The design-heavy core. The data contract is unchanged, so we lock structural invariants with a render test first, then iterate the visual treatment in the browser preview. "Spectacular" is verified in-preview, not asserted pixel-by-pixel.

**Files:**
- Modify: `components/cv/cv-document.tsx` (rewrite markup/styles; keep the `CvDocumentView({ kb, lang })` signature and the `allRepos(kb)` usage)
- Modify: `components/cv/print.css` (A4 print fidelity)
- Test: `tests/components/cv/cv-document.test.tsx`

**Interfaces:**
- Consumes: `makeKb` (Task 1), `CV_STRINGS` (`lib/cv/strings.ts`), `allRepos` (`lib/kb/repos.ts`)
- Produces: unchanged `export function CvDocumentView({ kb, lang }: { kb: Kb; lang: KbLang })`

- [ ] **Step 1: Write the failing structural-invariant test**

Create `tests/components/cv/cv-document.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CvDocumentView } from "@/components/cv/cv-document";
import { makeKb } from "../../helpers/cv-fixtures";

describe("CvDocumentView", () => {
  it("renders the identity header from profile", () => {
    render(<CvDocumentView kb={makeKb()} lang="en" />);
    expect(screen.getByRole("heading", { level: 1, name: "Ada Lovelace" })).toBeInTheDocument();
    expect(screen.getByText("Computing pioneer")).toBeInTheDocument();
  });

  it("renders each section heading when its data is present", () => {
    render(<CvDocumentView kb={makeKb()} lang="en" />);
    for (const h of ["Experience", "Education", "Skills", "Selected projects", "Talks", "Open source"]) {
      expect(screen.getByRole("heading", { name: h })).toBeInTheDocument();
    }
  });

  it("omits a section when its data is empty", () => {
    render(<CvDocumentView kb={makeKb({ talks: [], projects: [] })} lang="en" />);
    expect(screen.queryByRole("heading", { name: "Talks" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Selected projects" })).toBeNull();
    // Experience still present
    expect(screen.getByRole("heading", { name: "Experience" })).toBeInTheDocument();
  });

  it("lists public repos under Open source", () => {
    render(<CvDocumentView kb={makeKb()} lang="en" />);
    expect(screen.getByRole("link", { name: "note-g" })).toHaveAttribute(
      "href",
      "https://github.com/ada/note-g",
    );
  });
});
```

> The section names match `CV_STRINGS.en.sections` (`projects` → "Selected projects", `code` → "Open source"). Keep those string values; the rewrite changes *layout*, not section labels.

- [ ] **Step 2: Run to verify the test runs against the current component**

Run: `pnpm exec vitest run tests/components/cv/cv-document.test.tsx`
Expected: PASS against the *current* component (these invariants already hold). This test is the safety net for the rewrite — it must stay green through Steps 3–5.

- [ ] **Step 3: Rewrite `print.css` for A4 fidelity**

Replace `components/cv/print.css` with the A4 baseline below, then refine during preview. The non-negotiable rules:

```css
/* Screen: tasteful document column. The cv-page owns its own rhythm. */
.cv-prose ul { list-style: disc; padding-left: 1.1rem; }
.cv-prose li { margin-top: 0.15rem; }

@media print {
  /* A4 with comfortable margins; remove the browser's default header/footer
     by keeping content within the page box. */
  @page { size: A4; margin: 14mm 16mm; }

  html, body { background: #fff !important; }

  /* Honor section background fills / accent colors in print. */
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }

  /* Hide app chrome (top bar, buttons) when printing the standalone page. */
  .no-print { display: none !important; }

  /* Keep entries and section headers from splitting across pages. */
  .cv-section { break-inside: avoid; }
  .cv-entry { break-inside: avoid; }
  h2 { break-after: avoid; }

  /* Let the document use the full print column. */
  .cv-page { max-width: none; }
}
```

- [ ] **Step 4: Rewrite `CvDocumentView` markup into the house style**

Rewrite `components/cv/cv-document.tsx` keeping the signature, the `formatPeriod`/`firstBulletList` helpers, and `allRepos(kb)`. Requirements for the rewrite (the visual craft is iterated in Step 6):

- One coherent house style using design tokens only (`var(--color-*)`, `font-display`, `font-mono`).
- Preserve the section order and the `CV_STRINGS` labels: identity header → Experience → Education → Skills → Selected projects → Talks → Open source.
- Keep the class hooks the print stylesheet targets: root `article.cv-page`, each `<section className="cv-section">`, each entry `className="cv-entry"`, prose blocks `className="cv-prose"`.
- Keep the empty-section guards (`{kb.experience.length > 0 && …}`, etc.) so the Step-1 test's omit-behavior holds.
- Keep highlights-with-`ReactMarkdown` and the `firstBulletList` fallback for experience bullets.

Start from the current component as the structural base (it already satisfies the invariants); evolve typography, spacing, rules/dividers, and the header into the perfected look. Do **not** remove the `cv-section`/`cv-entry`/`cv-page`/`cv-prose` hooks.

- [ ] **Step 5: Re-run the invariant test (must stay green)**

Run: `pnpm exec vitest run tests/components/cv/cv-document.test.tsx`
Expected: PASS. If a section heading assertion fails, you changed a label or dropped a guard — restore it.

- [ ] **Step 6: Verify the look in the browser preview (iterate here)**

This is where "spectacular" is achieved. Use the preview tools:
1. `preview_start` (if not running), navigate to `/cv` (root account) — the standalone page renders the same `CvDocumentView`.
2. `preview_screenshot` — assess the screen look; iterate on `cv-document.tsx` until it's the house style you want.
3. Print fidelity: open `/cv?print=1` and use `preview_screenshot` / emulate print; confirm A4 pagination, no clipped entries, accent fills preserved, app chrome hidden.
4. `preview_resize` to a narrow width — confirm it degrades gracefully (single column, no overflow).
5. Re-run Step 5's test after each markup change to ensure invariants hold.

- [ ] **Step 7: Typecheck, lint, commit**

```bash
pnpm typecheck && pnpm lint && pnpm exec vitest run tests/components/cv/cv-document.test.tsx
git add components/cv/cv-document.tsx components/cv/print.css tests/components/cv/cv-document.test.tsx
git commit -m "feat(cv): perfected house-style CV renderer + A4 print stylesheet"
```

---

### Task 3: `CvModal` component (+ share strings)

A dedicated modal mirroring `McpModal` (overlay + `useDialog`) with a Download / Share / Print toolbar, hosting `CvDocumentClient`.

**Files:**
- Modify: `lib/language.ts` (add `share` / `shareAria` to `en.kb` and `fr.kb`)
- Modify: `tests/helpers/kb-fixtures.ts` (add the two keys to `KB_STRINGS`)
- Create: `components/cv/cv-modal.tsx`
- Create: `tests/components/cv/cv-modal.test.tsx`

**Interfaces:**
- Consumes: `useKb()` (`lang`, `strings`, `apiBasePath`, `cvPrintBase`), `useDialog`, `CvDocumentClient`, `LanguageToggle`, `DownloadIcon`/`PrintIcon` + `KbDocAction` type, `assembleCvMarkdown`/`cvDownloadFilename` (Task 1)
- Produces: `export function CvModal({ open, onClose, onLangChange }: { open: boolean; onClose: () => void; onLangChange: (next: UiLang) => void })`

- [ ] **Step 1: Add the `share` strings (both locales)**

In `lib/language.ts`, in the `en` `kb` object (after `printAria`, near line 123) add:
```ts
        share: "Share",
        shareAria: "Share a link to this CV",
```
In the `fr` `kb` object (after `printAria`, near line 266) add:
```ts
        share: "Partager",
        shareAria: "Partager un lien vers ce CV",
```

- [ ] **Step 2: Add the same keys to the test stub**

In `tests/helpers/kb-fixtures.ts`, in `KB_STRINGS` (after `printAria`, near line 52) add:
```ts
  share: "Share",
  shareAria: "Share a link to this CV",
```

- [ ] **Step 3: Verify the strings typecheck**

Run: `pnpm typecheck`
Expected: PASS. (If `KB_STRINGS` is missing a key the new type requires, `tsc` flags it here.)

- [ ] **Step 4: Write the failing modal test**

Create `tests/components/cv/cv-modal.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// useKb is mocked so the modal can render without <KbProvider>.
const { ctxRef } = vi.hoisted(() => ({ ctxRef: { current: null as unknown } }));
vi.mock("@/components/kb/kb-context", () => ({ useKb: () => ctxRef.current }));
// Stub the document body so the modal test doesn't hit the network.
vi.mock("@/components/cv/cv-document-client", () => ({
  CvDocumentClient: ({ lang }: { lang: string }) => <div data-testid="cv-doc">{lang}</div>,
}));

import { CvModal } from "@/components/cv/cv-modal";
import { makeKbContext } from "../../helpers/kb-fixtures";

beforeEach(() => {
  ctxRef.current = makeKbContext();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("CvModal", () => {
  it("renders nothing when closed", () => {
    render(<CvModal open={false} onClose={vi.fn()} onLangChange={vi.fn()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders the document and toolbar actions when open", () => {
    render(<CvModal open onClose={vi.fn()} onLangChange={vi.fn()} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByTestId("cv-doc")).toBeInTheDocument();
    expect(screen.getByLabelText("Download document")).toBeInTheDocument();
    expect(screen.getByLabelText("Share a link to this CV")).toBeInTheDocument();
    expect(screen.getByLabelText("Print or save as PDF")).toBeInTheDocument();
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(<CvModal open onClose={onClose} onLangChange={vi.fn()} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Share copies the public link when the Web Share API is unavailable", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    // No navigator.share in jsdom → falls back to clipboard.
    render(<CvModal open onClose={vi.fn()} onLangChange={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("Share a link to this CV"));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0][0]).toContain("/cv?lang=en");
  });
});
```

- [ ] **Step 5: Run to verify it fails**

Run: `pnpm exec vitest run tests/components/cv/cv-modal.test.tsx`
Expected: FAIL — `Cannot find module '@/components/cv/cv-modal'`.

- [ ] **Step 6: Implement `CvModal`**

Create `components/cv/cv-modal.tsx`:

```tsx
"use client";

import { useState, type ReactNode } from "react";
import { useKb } from "@/components/kb/kb-context";
import { useDialog } from "@/lib/use-dialog";
import { LanguageToggle } from "@/components/language-toggle";
import { DownloadIcon, PrintIcon, type KbDocAction } from "@/components/kb/kb-doc-toolbar";
import { assembleCvMarkdown, cvDownloadFilename } from "@/lib/cv/markdown";
import { CvDocumentClient } from "./cv-document-client";
import type { Kb } from "@/lib/kb/loader";
import type { UiLang } from "@/lib/language";
import { cn } from "@/lib/utils";
import "./print.css";

export function CvModal({
  open,
  onClose,
  onLangChange,
}: {
  open: boolean;
  onClose: () => void;
  onLangChange: (next: UiLang) => void;
}) {
  const { lang, strings, apiBasePath, cvPrintBase } = useKb();
  const dialogRef = useDialog<HTMLDivElement>(open, onClose);

  if (!open) return null;

  async function fetchCvKb(): Promise<Kb> {
    const res = await fetch(`${apiBasePath}/cv?lang=${lang}`);
    const { kb } = (await res.json()) as { kb: Kb };
    return kb;
  }

  async function downloadCv(): Promise<void> {
    const kb = await fetchCvKb();
    const md = assembleCvMarkdown(kb, lang);
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = cvDownloadFilename(kb.profile.name, lang);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function shareCv(): Promise<string | void> {
    const shareUrl = `${window.location.origin}${cvPrintBase}/cv?lang=${lang}`;
    const nav = navigator as Navigator & { canShare?: (d?: ShareData) => boolean };
    try {
      const kb = await fetchCvKb();
      const title = `${kb.profile.name} — CV`;
      const file = new File([assembleCvMarkdown(kb, lang)], cvDownloadFilename(kb.profile.name, lang), {
        type: "text/markdown",
      });
      if (nav.share && nav.canShare?.({ files: [file] })) {
        await nav.share({ title, url: shareUrl, files: [file] });
        return;
      }
      if (nav.share) {
        await nav.share({ title, url: shareUrl });
        return;
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return; // user cancelled the share sheet
      // any other failure → fall through to clipboard
    }
    await navigator.clipboard.writeText(shareUrl);
    return strings.copied;
  }

  function printCv(): void {
    // Open the standalone CV with the A4 print stylesheet; ?print=1 auto-fires print.
    window.open(`${cvPrintBase}/cv?lang=${lang}&print=1`, "_blank", "noopener");
  }

  const actions: KbDocAction[] = [
    { key: "download", label: strings.download, ariaLabel: strings.downloadAria, icon: <DownloadIcon />, onClick: downloadCv },
    { key: "share", label: strings.share, ariaLabel: strings.shareAria, icon: <ShareIcon />, onClick: shareCv },
    { key: "print", label: strings.print, ariaLabel: strings.printAria, icon: <PrintIcon />, onClick: printCv },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cv-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] shadow-2xl outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--color-border)] px-4">
          <h2
            id="cv-modal-title"
            className="min-w-0 flex-1 truncate font-display text-[14px] font-semibold text-[var(--color-text-primary)]"
          >
            {strings.cv}
          </h2>
          <LanguageToggle value={lang} onChange={onLangChange} />
          <div className="flex items-center gap-1.5">
            {actions.map((a) => (
              <ModalAction key={a.key} action={a} />
            ))}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={strings.close}
            className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[var(--color-border)] text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-text-primary)]"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-8">
          <CvDocumentClient lang={lang} />
        </div>
      </div>
    </div>
  );
}

/** Toolbar button with the transient feedback state (e.g. "Copied"), mirroring
 * the KB doc toolbar's ActionButton (which isn't exported). */
function ModalAction({ action }: { action: KbDocAction }) {
  const [feedback, setFeedback] = useState<string | null>(null);
  return (
    <button
      type="button"
      onClick={async () => {
        const result = await action.onClick();
        if (typeof result === "string") {
          setFeedback(result);
          setTimeout(() => setFeedback(null), 1500);
        }
      }}
      aria-label={action.ariaLabel}
      title={feedback ?? action.label}
      className={cn(
        "inline-flex h-6 w-6 items-center justify-center rounded-full border transition-colors",
        feedback
          ? "border-[var(--color-accent)] text-[var(--color-accent)]"
          : "border-[var(--color-border)] text-[var(--color-text-tertiary)] hover:text-[var(--color-accent)]",
      )}
    >
      {action.icon as ReactNode}
    </button>
  );
}

function ShareIcon() {
  return (
    <svg
      width={13}
      height={13}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
    </svg>
  );
}
```

- [ ] **Step 7: Run the modal tests to verify they pass**

Run: `pnpm exec vitest run tests/components/cv/cv-modal.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 8: Typecheck, lint, commit**

```bash
pnpm typecheck && pnpm lint
git add lib/language.ts tests/helpers/kb-fixtures.ts components/cv/cv-modal.tsx tests/components/cv/cv-modal.test.tsx
git commit -m "feat(cv): CvModal with Download/Share/Print toolbar"
```

---

### Task 4: Promote the top-bar CV control to a prominent labeled button

**Files:**
- Modify: `components/app-top-bar.tsx` (CV control → labeled pill)
- Modify: `tests/components/app-top-bar.test.tsx` (assert the prominent button)

**Interfaces:**
- Consumes: existing `cvButtonLabel?: string`, `onOpenCv?: () => void` props (unchanged)
- Produces: a `<button>` exposing its accessible name as `cvButtonLabel`, with visible label text

- [ ] **Step 1: Add the failing test**

Append to `tests/components/app-top-bar.test.tsx`:

```tsx
describe("AppTopBar CV button", () => {
  it("renders a prominent CV button with a visible label when onOpenCv is provided", () => {
    const onOpenCv = vi.fn();
    render(<AppTopBar {...baseProps({ cvButtonLabel: "Open CV", onOpenCv })} />);
    const btn = screen.getByRole("button", { name: "Open CV" });
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveTextContent("CV"); // visible text, not an icon-only control
    fireEvent.click(btn);
    expect(onOpenCv).toHaveBeenCalledTimes(1);
  });

  it("renders no CV button when onOpenCv is omitted", () => {
    render(<AppTopBar {...baseProps()} />);
    expect(screen.queryByRole("button", { name: "Open CV" })).toBeNull();
  });
});
```

Add `fireEvent` to the existing import:
```tsx
import { render, screen, fireEvent } from "@testing-library/react";
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run tests/components/app-top-bar.test.tsx`
Expected: FAIL on `toHaveTextContent("CV")` — the current control is icon-only.

- [ ] **Step 3: Replace the icon-only CV control with a labeled pill**

In `components/app-top-bar.tsx`, replace the `{onOpenCv && (…)}` block (currently the `ICON_BTN` button wrapping `<CvIcon />`) with:

```tsx
        {onOpenCv && (
          <button
            type="button"
            onClick={onOpenCv}
            aria-label={cvButtonLabel}
            title={cvButtonLabel}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-accent)] bg-[var(--color-accent)]/10 px-3 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent)]/20"
          >
            <CvIcon />
            <span>CV</span>
          </button>
        )}
```

(The `CvIcon` helper at the bottom of the file is unchanged.)

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run tests/components/app-top-bar.test.tsx`
Expected: PASS (all existing + 2 new tests).

- [ ] **Step 5: Typecheck, lint, commit**

```bash
pnpm typecheck && pnpm lint
git add components/app-top-bar.tsx tests/components/app-top-bar.test.tsx
git commit -m "feat(cv): prominent labeled CV button in the top bar"
```

---

### Task 5: Wire the modal into `HomeShell` and retire the in-panel CV view

**Files:**
- Modify: `components/home-shell.tsx` (own `cvOpen`; mount `CvModal`; rewire `openCv`)
- Modify: `components/kb/kb-context.tsx` (remove `CV_VIRTUAL_PATH` + `manifestWithCv`)
- Modify: `components/kb/kb-panel.tsx` (remove the CV special-case branch)
- Delete: `components/cv/cv-panel-view.tsx`

**Interfaces:**
- Consumes: `CvModal` (Task 3)
- Produces: `KbContextValue.manifest` now contains only real KB files (no synthetic CV entry); `CV_VIRTUAL_PATH` no longer exported

- [ ] **Step 1: Rewire `HomeShell` to open the modal**

In `components/home-shell.tsx`:

Replace the import line:
```ts
import { CV_VIRTUAL_PATH, useKb } from "@/components/kb/kb-context";
```
with:
```ts
import { useKb } from "@/components/kb/kb-context";
import { CvModal } from "@/components/cv/cv-modal";
import { useState } from "react";
```

Replace the `openCv` definition:
```ts
  const { openFile, cvPrintBase } = useKb();

  const openCv = () => {
    onKbCollapsedChange(false);
    openFile(CV_VIRTUAL_PATH);
  };
```
with:
```ts
  const { cvPrintBase } = useKb();
  const [cvOpen, setCvOpen] = useState(false);
```

Change the top-bar prop:
```tsx
          cvButtonLabel={t.kb.openCv}
          onOpenCv={() => setCvOpen(true)}
```

Mount the modal next to the other overlays (after the `<AboutPopover … />`):
```tsx
      <CvModal open={cvOpen} onClose={() => setCvOpen(false)} onLangChange={onLangChange} />
```

> `openFile` is no longer used in this file; `cvPrintBase` is still used by `AboutPopover`'s `cvHref`.

- [ ] **Step 2: Remove the synthetic CV entry from `KbProvider`**

In `components/kb/kb-context.tsx`:
- Delete the `CV_VIRTUAL_PATH` export (lines ~19–22).
- Delete the `manifestWithCv` `useMemo` (lines ~139–148).
- In the `value` `useMemo`, change `manifest: manifestWithCv` to `manifest`, and replace `manifestWithCv` in the dependency array with `manifest`.

(The `strings` import stays — still used elsewhere in the value.)

- [ ] **Step 3: Remove the CV branch from `KbPanel`**

In `components/kb/kb-panel.tsx`:
- Change the import to drop `CV_VIRTUAL_PATH`:
  ```ts
  import { useKb } from "@/components/kb/kb-context";
  ```
- Delete the `import { CvPanelView } …` line.
- Delete the special-case block:
  ```tsx
  // The synthesized CV doc isn't a real file — render the dedicated view.
  if (openTarget?.path === CV_VIRTUAL_PATH) {
    return ( … <CvPanelView … /> … );
  }
  ```

- [ ] **Step 4: Delete the retired component**

```bash
git rm components/cv/cv-panel-view.tsx
```

- [ ] **Step 5: Find and remove any now-dead references / tests**

Run: `rg -n "CV_VIRTUAL_PATH|CvPanelView|cv-panel-view" --glob '!docs/**'`
Expected: no matches in `components/`, `lib/`, `app/`, `tests/`. If a test referenced the in-panel CV branch, delete that test (the modal tests in Task 3 cover the replacement). Docs under `docs/` may still mention it — leave them.

- [ ] **Step 6: Typecheck, lint, full test run**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: clean types, clean lint, all tests pass.

- [ ] **Step 7: Verify the end-to-end flow in the browser preview**

1. `preview_start` (if needed); load the app shell (`/`).
2. Confirm the prominent **CV** button is visible in the top bar; `preview_click` it.
3. `preview_snapshot` — the modal is open, the document renders (real fetch), toolbar shows Download / Share / Print.
4. Test **Print** (opens `/cv?print=1`), **Download** (`.md` downloads), **Share** (desktop → copies link; confirm via `preview_console_logs` or clipboard), language toggle switches en/fr.
5. Confirm the KB side panel no longer lists a CV entry at the top.
6. `preview_screenshot` of the open modal for the record.

- [ ] **Step 8: Commit**

```bash
git add components/home-shell.tsx components/kb/kb-context.tsx components/kb/kb-panel.tsx
git commit -m "feat(cv): open CV in a modal from the top bar; retire in-panel CV view"
```

---

### Task 6: Remove the now-dead `"cv"` KbFileType + handler branch

With the synthetic CV manifest entry gone, the `"cv"` artifact type is unreachable.

**Files:**
- Modify: `lib/kb/file-type.ts` (drop `"cv"` from `KbFileType`)
- Modify: `lib/kb/handlers.ts` (drop the `entry.type === "cv"` branch; simplify the `CONTENT_TYPE` type)

**Interfaces:**
- Produces: `KbFileType = "md" | "yaml" | "html" | "pdf"`

- [ ] **Step 1: Confirm `"cv"` is unreferenced as a value**

Run: `rg -n '"cv"' lib components app --glob '!**/*.test.*'`
Expected: no matches that assign or compare a KB file `type` to `"cv"` (only Task-6 targets, if any remain). If `home-shell`/`kb-context` still reference it, finish Task 5 first.

- [ ] **Step 2: Drop the type member**

In `lib/kb/file-type.ts`, change:
```ts
export type KbFileType = "md" | "yaml" | "html" | "pdf" | "cv";
```
to:
```ts
export type KbFileType = "md" | "yaml" | "html" | "pdf";
```
and update the doc comment above it to drop the "`cv` is reserved…" sentence.

- [ ] **Step 3: Drop the dead handler branch**

In `lib/kb/handlers.ts`:
- Change the `CONTENT_TYPE` declaration:
  ```ts
  const CONTENT_TYPE: Record<Exclude<KbFileType, "cv">, string> = {
  ```
  to:
  ```ts
  const CONTENT_TYPE: Record<KbFileType, string> = {
  ```
- Delete the branch (lines ~84–86):
  ```ts
  if (entry.type === "cv") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  ```
- Update the comment block above `CONTENT_TYPE` (lines ~11–13) that explains the `cv` exclusion — remove the `cv`-specific wording.

- [ ] **Step 4: Typecheck, lint, full test run**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: clean. (`tsc` confirms the `Record<KbFileType, string>` map is exhaustive and no remaining code expects `"cv"`.)

- [ ] **Step 5: Commit**

```bash
git add lib/kb/file-type.ts lib/kb/handlers.ts
git commit -m "chore(kb): remove dead 'cv' file-type after CV-modal consolidation"
```

---

## Self-Review

**Spec coverage:**
- House-style template → Task 2. ✓
- Dedicated modal → Task 3. ✓
- Prominent CV button → Task 4. ✓
- Download/Share/Print actions → Task 3 (Download = `.md`; Share = link + file w/ clipboard fallback; Print = `/cv?print=1`). ✓
- Print CSS / path-A PDF → Task 2 (print.css) + Task 3 (Print action). ✓
- Privacy invariant preserved → no task touches `cv-config.ts`/`load.ts`. ✓
- Retire in-panel CV (kb-context, kb-panel, delete cv-panel-view) → Task 5. ✓
- Relocate markdown helpers first → Task 1. ✓
- Verify-then-remove `"cv"` dead code → Task 6. ✓
- i18n `share` strings (en+fr+stub) → Task 3. ✓
- Out of scope (server PDF, multi/custom templates) → not planned. ✓

**Placeholder scan:** No "TBD"/"add error handling"/"similar to Task N". The one iterative element (Task 2 visual polish) ships concrete structural tests + a print.css baseline + an explicit preview loop — the craft is verified in-browser, not hand-waved. ✓

**Type consistency:** `assembleCvMarkdown(kb, lang)`, `cvFileSlug(name)`, `cvDownloadFilename(name, lang)` used identically in Tasks 1 and 3. `CvModal({ open, onClose, onLangChange })` defined in Task 3, consumed in Task 5. `KbDocAction`/`DownloadIcon`/`PrintIcon` imported from `kb-doc-toolbar` (verified exported). `makeKb` (Task 1) reused in Task 2. `KbStrings.share`/`shareAria` added in Task 3 before any consumer. ✓
