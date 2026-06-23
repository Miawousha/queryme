# CV Header Profile Photo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render an optional circular profile photo at the head of the CV, leading the identity row, shown only when `profile.photo` is set.

**Architecture:** Purely additive change to one server component. A new inner flex wraps a `<img>` (the avatar) and the existing identity column so the QR block keeps its place. The photo is read from `kb.profile.photo` (an existing, currently-unrendered schema field) and rendered as a plain `<img>` — no `next/image`, no new route, no schema change. When `profile.photo` is unset, markup is byte-for-byte today's header.

**Tech Stack:** Next.js 15 (React Server Components), Tailwind v4 (CSS-variable tokens), Vitest + @testing-library/react (jsdom).

## Global Constraints

- Source is `profile.photo` only — no GitHub-avatar fallback; "no photo" is a first-class, unchanged state.
- Rendered as a plain `<img src>` (expected value: an absolute `https` URL or root-relative path). No `next/image`, no remote-pattern config, no serving route.
- Photo is independent of the QR props — it ships everywhere the header renders (`/cv` and the embedded/modal view).
- Reuse existing `components/cv/print.css` as-is; ship **no** new print rule. The avatar ring uses `var(--color-border)` so it flips for print automatically.
- Avatar: circle, `h-20 w-20` (80px), `object-cover`, `ring-1 ring-[var(--color-border)]`.
- Design tokens only — use `var(--color-*)` and the existing type scale; no hard-coded `text-[Npx]` colors.
- Verification gates: `npm run typecheck` and `npm test`. The repo has no ESLint config, so a plain `<img>` is safe.
- Spec: `docs/superpowers/specs/2026-06-23-cv-header-photo-design.md`.

---

### Task 1: Render the optional profile photo with a localized alt

**Files:**
- Modify: `lib/cv/strings.ts` (add `photoAlt` to the `en` and `fr` objects, next to `qrAlt` at lines 20 / 53)
- Modify: `components/cv/cv-document.tsx:133-188` (the `<header>` identity row)
- Test: `tests/components/cv/cv-document.test.tsx` (append cases)

**Interfaces:**
- Consumes: `CvDocumentView({ kb, lang, profileUrl?, qrSvg? })` (existing); `CV_STRINGS[lang]` (existing); `kb.profile.photo?: string` and `kb.profile.name: string` (existing `Profile` fields).
- Produces: `CV_STRINGS[lang].photoAlt: string` — a template containing the literal `{name}`, consumed only inside `cv-document.tsx` via `t.photoAlt.replace("{name}", kb.profile.name)`.

- [ ] **Step 1: Write the failing tests**

Append these three cases inside the `describe("CvDocumentView", …)` block in `tests/components/cv/cv-document.test.tsx` (before the closing `});`):

```tsx
  it("renders the profile photo with the person's name as alt when profile.photo is set", () => {
    const kb = makeKb({
      profile: {
        name: "Ada Lovelace",
        headline: "Computing pioneer",
        photo: "https://cdn.example.com/ada.jpg",
      },
    });
    render(<CvDocumentView kb={kb} lang="en" />);
    const photo = screen.getByRole("img", { name: "Portrait of Ada Lovelace" });
    expect(photo).toHaveAttribute("src", "https://cdn.example.com/ada.jpg");
  });

  it("omits the profile photo when profile.photo is absent", () => {
    render(<CvDocumentView kb={makeKb()} lang="en" />);
    // The QR is also role=img; assert specifically that no portrait img exists.
    expect(screen.queryByRole("img", { name: /^Portrait of/ })).toBeNull();
  });

  it("renders the photo independently of the QR block", () => {
    const kb = makeKb({
      profile: {
        name: "Ada Lovelace",
        headline: "Computing pioneer",
        photo: "https://cdn.example.com/ada.jpg",
      },
    });
    render(
      <CvDocumentView kb={kb} lang="en" profileUrl="https://cv.alex.com" qrSvg="<svg></svg>" />,
    );
    // Both the portrait and the QR render together.
    expect(screen.getByRole("img", { name: "Portrait of Ada Lovelace" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Profile QR code" })).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/components/cv/cv-document.test.tsx`
Expected: the two photo-present cases FAIL — no `img` with name `"Portrait of Ada Lovelace"` is found (the photo isn't rendered yet). `tsc`/TS may also flag `t.photoAlt` once Step 3's strings are referenced; that's fine — the failing render assertion is the gate.

- [ ] **Step 3: Add the localized `photoAlt` string**

In `lib/cv/strings.ts`, add `photoAlt` immediately after the `qrAlt` line in **both** locale objects.

In the `en` object (after `qrAlt: "Profile QR code",` at line 20):

```ts
    photoAlt: "Portrait of {name}",
```

In the `fr` object (after `qrAlt: "QR code du profil",` at line 53):

```ts
    photoAlt: "Portrait de {name}",
```

- [ ] **Step 4: Render the photo in the header**

In `components/cv/cv-document.tsx`, replace the opening of the identity row. Change this:

```tsx
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-display font-semibold leading-[1.1] tracking-[-0.01em] text-[var(--color-text-primary)]">
```

to this (wrap the identity column in a new flex and insert the avatar before it):

```tsx
        <div className="flex items-start justify-between gap-6">
          <div className="flex min-w-0 flex-1 items-start gap-5">
            {kb.profile.photo && (
              // eslint-disable-next-line @next/next/no-img-element -- plain <img>: any host, no next/image config; prints under existing print.css
              <img
                src={kb.profile.photo}
                alt={t.photoAlt.replace("{name}", kb.profile.name)}
                className="cv-photo h-20 w-20 shrink-0 rounded-full object-cover ring-1 ring-[var(--color-border)]"
              />
            )}
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-display font-semibold leading-[1.1] tracking-[-0.01em] text-[var(--color-text-primary)]">
```

Then add the matching closing `</div>` for the new wrapper. The identity column currently closes at `cv-document.tsx:174` with a single `</div>` right before `{profileUrl && qrSvg && (`. Add one more `</div>` there so both the identity column and the new wrapper close:

Change this:

```tsx
            </div>
          </div>
          {profileUrl && qrSvg && (
```

to this:

```tsx
            </div>
            </div>
          </div>
          {profileUrl && qrSvg && (
```

(The outer `<div className="flex items-start justify-between gap-6">` and the QR block are unchanged. Net structure: row → [ wrapper(avatar + identity) , QR ].)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- tests/components/cv/cv-document.test.tsx`
Expected: PASS — all cases green, including the pre-existing QR/identity/section tests (no regressions; the no-photo path renders identical markup to before).

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add lib/cv/strings.ts components/cv/cv-document.tsx tests/components/cv/cv-document.test.tsx
git commit -m "feat(cv): optional profile photo in the CV header

Render kb.profile.photo as a circular avatar leading the identity row
when set; no-photo header is unchanged. Bilingual portrait alt text."
```

---

### Task 2: Verify the layout in the browser preview

Confirms the four photo×QR states and the responsive collapse render as designed. The unit tests in Task 1 are the correctness gate; this task validates spacing, alignment, and print/ink-on-paper appearance that a DOM test can't see.

**Files:** none (verification only).

**Interfaces:** Consumes the running app's `/cv` route. Requires a locally-configured root account content root (via `PERSONA_LOCAL_OVERRIDE` pointing at the career content repo) **with a `photo:` set on the profile**. If no local content root is configured, skip the live preview and rely on the Task 1 tests plus the brainstorm mockup (`/cv` requires configured content and returns `NotConfiguredScreen` otherwise).

- [ ] **Step 1: Ensure a `photo:` exists in local content**

Confirm the profile YAML used by the local content root sets `photo:` to a reachable image URL (an absolute `https` URL is simplest). If you only need to eyeball the layout, temporarily set it; revert after.

- [ ] **Step 2: Start the dev preview and open `/cv`**

Use the preview workflow (`preview_start`, then navigate to `/cv`). Confirm no console errors via `preview_console_logs`.

- [ ] **Step 3: Verify the photo + QR state**

`preview_snapshot` and `preview_screenshot` of `/cv`. Confirm: circular 80px avatar leads the row, top-aligned with the name; identity column intact; QR block unchanged on the right.

- [ ] **Step 4: Verify graceful collapse**

Temporarily unset `photo:` (or load the embedded/modal view, which passes no QR) and re-screenshot. Confirm the no-photo header matches today's layout and the no-QR variant flows the identity column wide. Restore `photo:` after.

- [ ] **Step 5: Verify responsive + print**

`preview_resize` to a narrow (~390px) viewport: the avatar holds via `shrink-0` and the identity column reflows without crowding. Confirm the avatar ring reads correctly against the light ink-on-paper canvas (print preview / emulate print) — it should adopt the light border token, with the photo itself in color.

- [ ] **Step 6: Record the result**

Note pass/fail with a screenshot in the session. No commit (verification only). If Step 5 reveals crowding at mobile width, return to Task 1 and allow the row to wrap (add `flex-wrap` to the wrapper) — otherwise no change.

---

## Self-Review

**1. Spec coverage:**
- Source = `profile.photo` only → Task 1 reads `kb.profile.photo`, no fallback. ✓
- Layout Option A (avatar leads row, QR untouched) → Task 1 Step 4 wrapper. ✓
- Circle, 80px, object-cover, border ring → Task 1 Step 4 classes. ✓
- Bilingual `photoAlt` → Task 1 Step 3 (en + fr). ✓
- Everywhere the header renders (independent of QR) → Task 1 test "renders the photo independently of the QR block". ✓
- Print reuse, no new rule → Global Constraints; ring uses `var(--color-border)`; no print.css edit in any task. ✓
- Error handling (broken URL) / responsive → Task 2 Steps 4–5. ✓
- Tests across photo×QR states → Task 1 Step 1 (three cases). ✓
- No schema change → confirmed; `schemas.ts` not in any task's file list. ✓

**2. Placeholder scan:** No TBD/TODO; every code step shows complete code. ✓

**3. Type consistency:** `photoAlt` is defined in Task 1 Step 3 and consumed in Step 4 via `t.photoAlt.replace("{name}", kb.profile.name)`; `kb.profile.photo` / `kb.profile.name` are existing `Profile` fields. The `@next/next/no-img-element` disable comment is harmless (no ESLint runs); it documents intent. ✓
