# CV → QR Profile Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a QR code (+ printed URL) to the printable CV that points to the owner's live profile home at their configured custom domain, falling back to the platform URL.

**Architecture:** A server-side resolver (`resolveProfileUrl`) picks the account's active custom domain or the platform URL; a thin `qrcode` wrapper (`qrSvg`) renders a theme-adaptive inline SVG. Both run in the standalone `/cv` server pages and pass `profileUrl`+`qrSvg` props into the shared, synchronous `CvDocumentView`. The in-app modal passes neither, so it stays unchanged (no API work).

**Tech Stack:** Next.js (App Router, RSC), TypeScript, Tailwind, Drizzle, `qrcode`, Vitest + Testing Library (jsdom), pnpm.

## Global Constraints

- Package manager: **pnpm** (`pnpm test`, `pnpm typecheck`, `pnpm add …`).
- Test runner: Vitest, jsdom env. Run a single file with `pnpm exec vitest run <path>`.
- Path alias `@/…` maps to repo root (e.g. `@/lib/cv/qr`).
- The QR target is the profile **home** (`/`), i.e. the **root** of the canonical host — not `/cv`.
- `CvDocumentView` MUST stay a **synchronous** function component (it is shared with the client modal path `CvDocumentClient`). All async work happens in the server pages.
- Theme-adaptive QR: modules use `currentColor`; the print stylesheet already flips the CV palette, so currentColor prints as ink-on-white and shows light on the dark screen view.
- Resolver and QR generation MUST NOT throw — fail open (platform fallback / `null` QR).
- Do not touch `cv-modal.tsx`, `cv-document-client.tsx`, or any API route.
- Commit after each task. Work happens on a feature branch (created in Task 0).

---

### Task 0: Branch

**Files:** none (git only).

- [ ] **Step 1: Create the feature branch**

```bash
cd /Users/alexandrecollet/queryme
git checkout -b feat/cv-qr-profile-link
```

- [ ] **Step 2: Confirm the working tree is clean apart from the spec/plan docs**

```bash
git status --short
```
Expected: only `docs/superpowers/specs/2026-06-22-cv-qr-profile-link-design.md` and `docs/superpowers/plans/2026-06-22-cv-qr-profile-link.md` (untracked), nothing else.

- [ ] **Step 3: Commit the design + plan docs**

```bash
git add docs/superpowers/specs/2026-06-22-cv-qr-profile-link-design.md docs/superpowers/plans/2026-06-22-cv-qr-profile-link.md
git commit -m "docs(cv): spec + plan for QR profile link on the printable CV"
```

---

### Task 1: QR SVG wrapper (`lib/cv/qr.ts`)

**Files:**
- Create: `lib/cv/qr.ts`
- Add deps: `qrcode`, `@types/qrcode`
- Test: `tests/lib/cv/qr.test.ts`

**Interfaces:**
- Consumes: the `qrcode` package (`QRCode.toString`).
- Produces: `qrSvg(url: string): Promise<string | null>` — an inline `<svg>` string whose dark modules are `currentColor`, transparent background, no quiet-zone margin; `null` on any encoder failure.

- [ ] **Step 1: Add the dependency**

```bash
cd /Users/alexandrecollet/queryme
pnpm add qrcode
pnpm add -D @types/qrcode
```
Expected: `qrcode` in `dependencies`, `@types/qrcode` in `devDependencies`.

- [ ] **Step 2: Write the failing test**

Create `tests/lib/cv/qr.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const toString = vi.fn();
vi.mock("qrcode", () => ({ default: { toString } }));

beforeEach(() => vi.clearAllMocks());

describe("qrSvg", () => {
  it("returns an svg string with dark modules themed to currentColor", async () => {
    toString.mockResolvedValue('<svg viewBox="0 0 5 5"><path fill="#000000" d="M0 0h1v1H0z"/></svg>');
    const { qrSvg } = await import("@/lib/cv/qr");
    const out = await qrSvg("https://x.com");
    expect(out).toContain("<svg");
    expect(out).toContain("currentColor");
    expect(out).not.toContain("#000000");
  });

  it("passes the url and svg options to the encoder", async () => {
    toString.mockResolvedValue("<svg></svg>");
    const { qrSvg } = await import("@/lib/cv/qr");
    await qrSvg("https://cv.alex.com");
    expect(toString).toHaveBeenCalledWith(
      "https://cv.alex.com",
      expect.objectContaining({ type: "svg", margin: 0 }),
    );
  });

  it("returns null when the encoder throws", async () => {
    toString.mockRejectedValue(new Error("boom"));
    const { qrSvg } = await import("@/lib/cv/qr");
    expect(await qrSvg("https://x.com")).toBeNull();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/lib/cv/qr.test.ts`
Expected: FAIL — cannot resolve `@/lib/cv/qr`.

- [ ] **Step 4: Write the implementation**

Create `lib/cv/qr.ts`:

```ts
import QRCode from "qrcode";

/**
 * Inline SVG QR code for `url`, themed via `currentColor` so it inherits the
 * surrounding ink (light on the dark screen view, dark on the print palette).
 * Transparent background, no quiet-zone margin — the layout supplies whitespace.
 * Returns null on any encoder failure so CV rendering never breaks over a QR.
 */
export async function qrSvg(url: string): Promise<string | null> {
  try {
    const raw = await QRCode.toString(url, {
      type: "svg",
      margin: 0,
      errorCorrectionLevel: "M",
      color: { dark: "#000000", light: "#0000" },
    });
    return raw.replace(/#000000/gi, "currentColor");
  } catch {
    return null;
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm exec vitest run tests/lib/cv/qr.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/cv/qr.ts tests/lib/cv/qr.test.ts package.json pnpm-lock.yaml
git commit -m "feat(cv): add qrSvg wrapper for theme-adaptive inline QR codes"
```

---

### Task 2: Canonical profile URL resolver (`lib/cv/profile-url.ts`)

**Files:**
- Create: `lib/cv/profile-url.ts`
- Test: `tests/lib/cv/profile-url.test.ts`

**Interfaces:**
- Consumes: `getDb` from `@/lib/db/client`; `listDomainsByAccount` from `@/lib/domains/repo` (signature `(db, accountId) => Promise<Domain[]>`, ordered by `createdAt` ascending). `Domain` has `.hostname: string` and `.status: "pending" | "active" | "error"`.
- Produces: `resolveProfileUrl(opts: { accountId: string; username?: string }): Promise<string>` — the canonical profile-home URL.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/cv/profile-url.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const listDomainsByAccount = vi.fn();
vi.mock("@/lib/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/lib/domains/repo", () => ({ listDomainsByAccount }));

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.PERSONA_LOCAL_OVERRIDE;
  process.env.NEXT_PUBLIC_SITE_URL = "https://queritae.com";
});

describe("resolveProfileUrl", () => {
  it("prefers an active custom domain over a pending one", async () => {
    listDomainsByAccount.mockResolvedValue([
      { hostname: "pending.alex.com", status: "pending" },
      { hostname: "cv.alex.com", status: "active" },
    ]);
    const { resolveProfileUrl } = await import("@/lib/cv/profile-url");
    expect(await resolveProfileUrl({ accountId: "a", username: "alex" })).toBe("https://cv.alex.com");
  });

  it("picks the first active domain when several are active", async () => {
    listDomainsByAccount.mockResolvedValue([
      { hostname: "first.alex.com", status: "active" },
      { hostname: "second.alex.com", status: "active" },
    ]);
    const { resolveProfileUrl } = await import("@/lib/cv/profile-url");
    expect(await resolveProfileUrl({ accountId: "a", username: "alex" })).toBe("https://first.alex.com");
  });

  it("falls back to the platform URL with username when no domain is active", async () => {
    listDomainsByAccount.mockResolvedValue([{ hostname: "pending.alex.com", status: "pending" }]);
    const { resolveProfileUrl } = await import("@/lib/cv/profile-url");
    expect(await resolveProfileUrl({ accountId: "a", username: "alex" })).toBe("https://queritae.com/alex");
  });

  it("falls back to the bare site origin when no username is given (root account)", async () => {
    listDomainsByAccount.mockResolvedValue([]);
    const { resolveProfileUrl } = await import("@/lib/cv/profile-url");
    expect(await resolveProfileUrl({ accountId: "root" })).toBe("https://queritae.com");
  });

  it("short-circuits to the fallback under PERSONA_LOCAL_OVERRIDE without touching the DB", async () => {
    process.env.PERSONA_LOCAL_OVERRIDE = "1";
    const { resolveProfileUrl } = await import("@/lib/cv/profile-url");
    expect(await resolveProfileUrl({ accountId: "a", username: "alex" })).toBe("https://queritae.com/alex");
    expect(listDomainsByAccount).not.toHaveBeenCalled();
  });

  it("fails open to the fallback when the domains lookup throws", async () => {
    listDomainsByAccount.mockRejectedValue(new Error("db down"));
    const { resolveProfileUrl } = await import("@/lib/cv/profile-url");
    expect(await resolveProfileUrl({ accountId: "a", username: "alex" })).toBe("https://queritae.com/alex");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/lib/cv/profile-url.test.ts`
Expected: FAIL — cannot resolve `@/lib/cv/profile-url`.

- [ ] **Step 3: Write the implementation**

Create `lib/cv/profile-url.ts`:

```ts
import { getDb } from "@/lib/db/client";
import { listDomainsByAccount } from "@/lib/domains/repo";

/** Platform origin, e.g. https://queritae.com (trailing slash trimmed). Mirrors
 * the NEXT_PUBLIC_SITE_URL pattern in lib/auto-sync/url.ts. */
function siteOrigin(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

function fallbackUrl(username?: string): string {
  return username ? `${siteOrigin()}/${encodeURIComponent(username)}` : siteOrigin();
}

/**
 * Canonical public URL of an account's profile home (`/`). Prefers the oldest
 * verified custom domain (its root is already vanity-hosted to the tenant in
 * lib/domains/host.ts); otherwise the platform URL. Fails open to the platform
 * fallback — never throws — so the CV always renders.
 */
export async function resolveProfileUrl(opts: {
  accountId: string;
  username?: string;
}): Promise<string> {
  // Under the local persona override there is no DB row; use the fallback,
  // mirroring lib/accounts/root.ts.
  if (process.env.PERSONA_LOCAL_OVERRIDE) return fallbackUrl(opts.username);
  try {
    const domains = await listDomainsByAccount(getDb(), opts.accountId);
    const active = domains.find((d) => d.status === "active");
    if (active) return `https://${active.hostname}`;
  } catch {
    // fail open — fall through to the platform URL
  }
  return fallbackUrl(opts.username);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run tests/lib/cv/profile-url.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/cv/profile-url.ts tests/lib/cv/profile-url.test.ts
git commit -m "feat(cv): resolve canonical profile URL (custom domain → platform fallback)"
```

---

### Task 3: Render the QR in `CvDocumentView`

**Files:**
- Modify: `lib/cv/strings.ts` (add `qrAlt` to en + fr)
- Modify: `components/cv/cv-document.tsx` (props + header restructure + QR block)
- Modify: `components/cv/print.css` (size the injected svg)
- Test: `tests/components/cv/cv-document.test.tsx` (add two cases)

**Interfaces:**
- Consumes: `qrSvg` string and `profileUrl` string (from Task 4's pages).
- Produces: `CvDocumentView({ kb, lang, profileUrl?, qrSvg? })` — renders a QR block (a `role="img"` container with the inline SVG + the scheme-stripped URL) at the top-right of the header **only when both `profileUrl` and `qrSvg` are provided**.

- [ ] **Step 1: Add the localized QR label**

In `lib/cv/strings.ts`, add `qrAlt` to each locale. In the `en` object (alongside `present`/`yr`):

```ts
    qrAlt: "Profile QR code",
```
In the `fr` object:

```ts
    qrAlt: "QR code du profil",
```

- [ ] **Step 2: Write the failing tests**

In `tests/components/cv/cv-document.test.tsx`, add inside the `describe("CvDocumentView", …)` block:

```ts
  it("renders the profile QR (role=img) and the URL when profileUrl and qrSvg are provided", () => {
    render(
      <CvDocumentView
        kb={makeKb()}
        lang="en"
        profileUrl="https://cv.alex.com"
        qrSvg="<svg></svg>"
      />,
    );
    expect(screen.getByRole("img", { name: "Profile QR code" })).toBeInTheDocument();
    expect(screen.getByText("cv.alex.com")).toBeInTheDocument();
  });

  it("omits the QR block when profileUrl or qrSvg is absent", () => {
    render(<CvDocumentView kb={makeKb()} lang="en" />);
    expect(screen.queryByRole("img", { name: "Profile QR code" })).toBeNull();
  });
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm exec vitest run tests/components/cv/cv-document.test.tsx`
Expected: FAIL — the new `role="img"` QR is not yet rendered; URL text not found.

- [ ] **Step 4: Update the component signature**

In `components/cv/cv-document.tsx`, change the `CvDocumentView` signature from:

```tsx
export function CvDocumentView({ kb, lang }: { kb: Kb; lang: KbLang }) {
```
to:

```tsx
export function CvDocumentView({
  kb,
  lang,
  profileUrl,
  qrSvg,
}: {
  kb: Kb;
  lang: KbLang;
  profileUrl?: string;
  qrSvg?: string;
}) {
```

- [ ] **Step 5: Restructure the header to add the QR block**

In `components/cv/cv-document.tsx`, replace the existing `<header>…</header>` block (currently spanning the `h1`, headline, bio, the contacts `<div className="mt-4 flex flex-wrap …">`, and the two keyline `<span>`s) with:

```tsx
      <header className="cv-section relative mb-9 pb-6">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-[32px] font-semibold leading-[1.1] tracking-[-0.01em] text-[var(--color-text-primary)]">
              {kb.profile.name}
            </h1>
            {kb.profile.headline && (
              <p className="mt-1.5 font-display text-[16px] leading-snug text-[var(--color-text-secondary)]">
                {kb.profile.headline}
              </p>
            )}
            {kb.profile.bio && (
              <p className="mt-3 max-w-[64ch] font-display text-[14px] leading-relaxed text-[var(--color-text-tertiary)]">
                {kb.profile.bio}
              </p>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[12px] text-[var(--color-text-tertiary)]">
              {kb.profile.location && (
                <ContactItem icon={<PinIcon />}>{kb.profile.location}</ContactItem>
              )}
              {kb.publicContact.email && (
                <ContactItem icon={<MailIcon />} href={`mailto:${kb.publicContact.email}`}>
                  {kb.publicContact.email}
                </ContactItem>
              )}
              {links?.linkedin && (
                <ContactItem icon={<LinkedInIcon />} href={links.linkedin}>
                  LinkedIn
                </ContactItem>
              )}
              {links?.github && (
                <ContactItem icon={<GitHubIcon />} href={links.github}>
                  GitHub
                </ContactItem>
              )}
              {links?.website && (
                <ContactItem icon={<GlobeIcon />} href={links.website}>
                  {links.website.replace(/^https?:\/\//, "")}
                </ContactItem>
              )}
            </div>
          </div>
          {profileUrl && qrSvg && (
            <div className="flex shrink-0 flex-col items-center gap-1.5">
              <div
                role="img"
                aria-label={t.qrAlt}
                className="cv-qr h-[88px] w-[88px] text-[var(--color-text-primary)]"
                dangerouslySetInnerHTML={{ __html: qrSvg }}
              />
              <span className="font-mono text-[10px] tracking-[0.02em] text-[var(--color-text-tertiary)]">
                {profileUrl.replace(/^https?:\/\//, "")}
              </span>
            </div>
          )}
        </div>
        {/* Accent keyline anchoring the identity block. */}
        <span
          aria-hidden
          className="absolute bottom-0 left-0 h-[2px] w-16 rounded-full bg-[var(--color-accent)]"
        />
        <span aria-hidden className="absolute bottom-0 left-0 h-px w-full bg-[var(--color-border)]" />
      </header>
```

Note: `t` is already defined at the top of the component (`const t = CV_STRINGS[lang];`), so `t.qrAlt` is in scope.

- [ ] **Step 6: Size the injected SVG**

In `components/cv/print.css`, add near the top (screen styles, OUTSIDE the `@media print` block — e.g. after the `.cv-achievements strong` rule, before `@media print`):

```css
/* The QR is injected as a raw <svg> with its own width/height attributes; size
   it to its container box (CSS wins over the presentation attributes). */
.cv-qr svg {
  display: block;
  width: 100%;
  height: 100%;
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm exec vitest run tests/components/cv/cv-document.test.tsx`
Expected: PASS (all cases, including the two new ones).

- [ ] **Step 8: Commit**

```bash
git add lib/cv/strings.ts components/cv/cv-document.tsx components/cv/print.css tests/components/cv/cv-document.test.tsx
git commit -m "feat(cv): render profile QR + URL in the CV header (prop-gated)"
```

---

### Task 4: Wire the standalone CV pages

**Files:**
- Modify: `components/cv/cv-standalone.tsx` (forward `profileUrl`/`qrSvg`)
- Modify: `app/[username]/cv/page.tsx`
- Modify: `app/cv/page.tsx`

**Interfaces:**
- Consumes: `resolveProfileUrl` (Task 2), `qrSvg` (Task 1), `CvDocumentView` props (Task 3).
- Produces: both `/cv` and `/{username}/cv` pass a resolved `profileUrl` + generated `qrSvg` into `CvStandalone`. No unit test — pages are thin server glue covered by `pnpm typecheck` + the full suite + `pnpm build`.

- [ ] **Step 1: Forward the props through `CvStandalone`**

In `components/cv/cv-standalone.tsx`, update the component to accept and forward the two optional props. Change the signature/props block to:

```tsx
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
```
and change the rendered `CvDocumentView` line to:

```tsx
      <CvDocumentView kb={cvKb} lang={lang} profileUrl={profileUrl} qrSvg={qrSvg} />
```

- [ ] **Step 2: Wire the per-account page**

In `app/[username]/cv/page.tsx`, add imports at the top (after the existing `loadCvKb` import):

```tsx
import { resolveProfileUrl } from "@/lib/cv/profile-url";
import { qrSvg } from "@/lib/cv/qr";
```
Then replace the final two lines of `AccountCvPage` (the `loadCvKb` result check + `return`) with:

```tsx
  const result = await loadCvKb(account.id, lang);
  if (!result) return <NotConfiguredScreen />;
  const profileUrl = await resolveProfileUrl({ accountId: account.id, username: account.username });
  const qr = await qrSvg(profileUrl);
  return (
    <CvStandalone
      cvKb={result.cvKb}
      lang={lang}
      basePath={`/${account.username}`}
      profileUrl={profileUrl}
      qrSvg={qr ?? undefined}
    />
  );
```

- [ ] **Step 3: Wire the root page**

In `app/cv/page.tsx`, add imports at the top (after the existing `loadCvKb` import):

```tsx
import { resolveProfileUrl } from "@/lib/cv/profile-url";
import { qrSvg } from "@/lib/cv/qr";
```
Then replace the body of `CvPage` (from the `const lang = …` line onward) with:

```tsx
  const lang = parseCvLang(langParam);
  const accountId = await resolveRootAccountId();
  const result = await loadCvKb(accountId, lang);
  if (!result) return <NotConfiguredScreen />;
  const profileUrl = await resolveProfileUrl({ accountId });
  const qr = await qrSvg(profileUrl);
  return (
    <CvStandalone
      cvKb={result.cvKb}
      lang={lang}
      basePath=""
      profileUrl={profileUrl}
      qrSvg={qr ?? undefined}
    />
  );
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (no errors).

- [ ] **Step 5: Run the full test suite**

Run: `pnpm test`
Expected: PASS (all suites green, including the new `qr`, `profile-url`, and `cv-document` cases).

- [ ] **Step 6: Build**

Run: `pnpm build`
Expected: build succeeds (server pages compile with the new async resolver/QR calls).

- [ ] **Step 7: Commit**

```bash
git add components/cv/cv-standalone.tsx "app/[username]/cv/page.tsx" app/cv/page.tsx
git commit -m "feat(cv): wire profile QR into the standalone /cv pages"
```

---

## Verification (manual, after Task 4)

- [ ] Run `pnpm dev`, open `/<your-username>/cv` (or `/cv`): a QR appears top-right of the header with the URL beneath it; on the dark screen view the modules are light.
- [ ] Print/Save-as-PDF (the `?print=1` flow or the Print button): the QR renders crisp and black-on-white, and scanning it opens the profile home at the configured domain (or the platform URL when no custom domain is active).
- [ ] Open the in-app CV **modal**: it shows **no** QR (prop-gated path), confirming the modal/API is untouched.

## Self-Review Notes

- **Spec coverage:** custom-domain-vs-fallback resolution (Task 2) ✓; profile-home target (resolver returns host root) ✓; `qrcode` SVG, theme-adaptive, fail-open (Task 1) ✓; standalone-only / modal-untouched via prop gating (Tasks 3–4) ✓; tests for resolver + qr + render present/absent (Tasks 1–3) ✓.
- **Placeholders:** none — every code step shows full content.
- **Type consistency:** `resolveProfileUrl({ accountId, username? })`, `qrSvg(url): Promise<string|null>`, and `CvDocumentView`/`CvStandalone` `{ profileUrl?, qrSvg? }` props are used identically across Tasks 1–4. Pages pass `qr ?? undefined` to match the `qrSvg?: string` prop (resolver/wrapper return `string | null`).
