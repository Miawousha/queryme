# Queritae Signature Badge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a monochrome Queritae brand mark plus an in-app "Email signature" panel that hands each account a ready-to-paste HTML badge linking to their profile.

**Architecture:** One pure function (`queritaeMarkSvg`) is the single source of truth for the mark. A build script rasterizes it into committed static PNGs under `public/badge/` (email clients can't render SVG). A new admin settings subsection composes the user's profile URL (via the existing `resolveProfileUrl`) with a pure snippet builder and a copy UI.

**Tech Stack:** Next.js App Router, TypeScript, React client components, Tailwind v4 design tokens, Vitest + Testing Library, `@resvg/resvg-js` (dev-only rasterizer), pnpm.

## Global Constraints

- Package manager is **pnpm**. Test runner is **vitest** (`pnpm test`); type check is `pnpm typecheck`.
- Tests live under `tests/` mirroring source paths. Use `vitest` globals + `@testing-library/*` (already configured).
- **No icon library** — admin icons are hand-rolled inline SVG line glyphs (24×24 viewBox, `stroke="currentColor"`, `stroke-width="1.75"`). Match `components/admin/admin-rail.tsx`.
- Use **design tokens**, never raw px type sizes: `text-control`, `text-2xs`, `font-mono`, and `var(--color-*)`. No `text-[Npx]`.
- The email badge is **monochrome**, two colors only: ink `#0f172a` and white `#ffffff`. Brand cyan `#22d3ee` is used for the **favicon only**.
- The badge image is hosted at the **platform origin** from `NEXT_PUBLIC_SITE_URL` (trailing slash trimmed; fallback `http://localhost:3000`) — never a custom domain.
- Scripts are agent-runnable via `tsx` (see `package.json` scripts). The rasterizer dependency must be a **devDependency** (never imported by runtime app code).
- Mark geometry is fixed on a **96-unit grid**: ring `cx=48 cy=44 r=26 stroke-width=11`; cursor `x=56 y=53 w=18 h=18 rx=4`; tile `96×96 rx=22`.

---

### Task 1: Canonical brand mark — `queritaeMarkSvg`

**Files:**
- Create: `lib/brand/queritae-mark.ts`
- Test: `tests/lib/brand/queritae-mark.test.ts`

**Interfaces:**
- Produces: `queritaeMarkSvg(opts?: QueritaeMarkOptions): string` where
  `QueritaeMarkOptions = { lockup?: "tile" | "glyph"; color?: string; size?: number; id?: string }`.
  Defaults: `lockup="tile"`, `color="#0f172a"`, `size=96`, `id="q"`. Also exports `type MarkLockup`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/brand/queritae-mark.test.ts
import { describe, it, expect } from "vitest";
import { queritaeMarkSvg } from "@/lib/brand/queritae-mark";

describe("queritaeMarkSvg", () => {
  it("returns a 96-viewBox svg sized to `size`", () => {
    const svg = queritaeMarkSvg({ size: 48 });
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('viewBox="0 0 96 96"');
    expect(svg).toContain('width="48" height="48"');
  });

  it("tile lockup knocks the Q out of a solid fill via a mask", () => {
    const svg = queritaeMarkSvg({ lockup: "tile", color: "#0f172a" });
    expect(svg).toContain("<mask");
    expect(svg).toContain('rx="22"');
    expect(svg).toContain('fill="#0f172a"');
    expect(svg).toContain('mask="url(#q)"');
  });

  it("glyph lockup strokes the ring in the chosen color and uses no mask", () => {
    const svg = queritaeMarkSvg({ lockup: "glyph", color: "#ffffff" });
    expect(svg).not.toContain("<mask");
    expect(svg).toContain('stroke="#ffffff"');
  });

  it("uses a custom mask id so several marks can inline without collisions", () => {
    const svg = queritaeMarkSvg({ id: "q-dark" });
    expect(svg).toContain('<mask id="q-dark">');
    expect(svg).toContain('mask="url(#q-dark)"');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/lib/brand/queritae-mark.test.ts`
Expected: FAIL — cannot resolve `@/lib/brand/queritae-mark`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/brand/queritae-mark.ts

export type MarkLockup = "tile" | "glyph";

export interface QueritaeMarkOptions {
  /** "tile" = solid square with the Q knocked out; "glyph" = bare Q on transparent. */
  lockup?: MarkLockup;
  /** Any CSS color for the mark's single fill. Default ink #0f172a. */
  color?: string;
  /** Rendered width/height in px (viewBox stays 96). Default 96. */
  size?: number;
  /** DOM id for the knockout mask — make unique when inlining several. Default "q". */
  id?: string;
}

// Fixed 96-unit geometry — the only place glyph proportions are defined.
const RING = { cx: 48, cy: 44, r: 26, w: 11 };
const CURSOR = { x: 56, y: 53, w: 18, h: 18, rx: 4 };

/**
 * The Queritae mark as an SVG string. The "tile" lockup carves the Q + cursor
 * out of a solid square via a mask, so the whole mark is one recolorable fill
 * and the knockout is true transparency (renders correctly on any background).
 */
export function queritaeMarkSvg(opts: QueritaeMarkOptions = {}): string {
  const { lockup = "tile", color = "#0f172a", size = 96, id = "q" } = opts;
  const open =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" ` +
    `viewBox="0 0 96 96" role="img" aria-label="Queritae">`;

  if (lockup === "glyph") {
    return (
      open +
      `<circle cx="${RING.cx}" cy="${RING.cy}" r="${RING.r}" fill="none" stroke="${color}" stroke-width="${RING.w}"/>` +
      `<rect x="${CURSOR.x}" y="${CURSOR.y}" width="${CURSOR.w}" height="${CURSOR.h}" rx="${CURSOR.rx}" fill="${color}"/>` +
      `</svg>`
    );
  }

  return (
    open +
    `<mask id="${id}">` +
    `<rect width="96" height="96" fill="#fff"/>` +
    `<circle cx="${RING.cx}" cy="${RING.cy}" r="${RING.r}" fill="none" stroke="#000" stroke-width="${RING.w}"/>` +
    `<rect x="${CURSOR.x}" y="${CURSOR.y}" width="${CURSOR.w}" height="${CURSOR.h}" rx="${CURSOR.rx}" fill="#000"/>` +
    `</mask>` +
    `<rect width="96" height="96" rx="22" fill="${color}" mask="url(#${id})"/>` +
    `</svg>`
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/lib/brand/queritae-mark.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/brand/queritae-mark.ts tests/lib/brand/queritae-mark.test.ts
git commit -m "feat(brand): canonical queritae mark svg"
```

---

### Task 2: Signature snippet builder — `buildSignatureSnippet`

**Files:**
- Create: `lib/brand/signature-snippet.ts`
- Test: `tests/lib/brand/signature-snippet.test.ts`

**Interfaces:**
- Produces: `buildSignatureSnippet(opts: SignatureSnippetOptions): string` where
  `SignatureSnippetOptions = { profileUrl: string; origin: string; color: BadgeColor }` and
  `type BadgeColor = "ink" | "white"`. Returns the email-signature HTML anchor wrapping the badge `<img>`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/brand/signature-snippet.test.ts
import { describe, it, expect } from "vitest";
import { buildSignatureSnippet } from "@/lib/brand/signature-snippet";

describe("buildSignatureSnippet", () => {
  it("links the badge to the profile with a signature ref param", () => {
    const out = buildSignatureSnippet({
      profileUrl: "https://queritae.com/alex",
      origin: "https://queritae.com",
      color: "ink",
    });
    expect(out).toContain('href="https://queritae.com/alex?ref=signature"');
    expect(out).toContain('src="https://queritae.com/badge/queritae-ink.png"');
    expect(out).toContain('width="24" height="24"');
    expect(out).toContain('alt="Queritae"');
  });

  it("references the white png when color=white", () => {
    const out = buildSignatureSnippet({ profileUrl: "https://x.com", origin: "https://queritae.com", color: "white" });
    expect(out).toContain("queritae-white.png");
  });

  it("uses & when the profile url already has a query", () => {
    const out = buildSignatureSnippet({ profileUrl: "https://q.com/a?x=1", origin: "https://q.com", color: "ink" });
    expect(out).toContain('href="https://q.com/a?x=1&ref=signature"');
  });

  it("trims a trailing slash on origin", () => {
    const out = buildSignatureSnippet({ profileUrl: "https://q.com/a", origin: "https://queritae.com/", color: "ink" });
    expect(out).toContain('src="https://queritae.com/badge/queritae-ink.png"');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/lib/brand/signature-snippet.test.ts`
Expected: FAIL — cannot resolve `@/lib/brand/signature-snippet`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/brand/signature-snippet.ts

export type BadgeColor = "ink" | "white";

export interface SignatureSnippetOptions {
  /** The user's public profile URL (from resolveProfileUrl). */
  profileUrl: string;
  /** Platform origin hosting the badge image, e.g. https://queritae.com. */
  origin: string;
  /** Which monochrome PNG to reference. */
  color: BadgeColor;
}

/** Appends the signature attribution param, respecting any existing query. */
function withRef(url: string): string {
  return url + (url.includes("?") ? "&" : "?") + "ref=signature";
}

/** Ready-to-paste email-signature HTML: the brand badge linking to the profile. */
export function buildSignatureSnippet({ profileUrl, origin, color }: SignatureSnippetOptions): string {
  const href = withRef(profileUrl);
  const src = `${origin.replace(/\/$/, "")}/badge/queritae-${color}.png`;
  return (
    `<a href="${href}">\n` +
    `  <img src="${src}" alt="Queritae" width="24" height="24" style="border:0" />\n` +
    `</a>`
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/lib/brand/signature-snippet.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/brand/signature-snippet.ts tests/lib/brand/signature-snippet.test.ts
git commit -m "feat(brand): email-signature snippet builder"
```

---

### Task 3: Asset manifest + build script → generated badge files

**Files:**
- Create: `lib/brand/badge-assets.ts`
- Create: `scripts/build-badge.ts`
- Modify: `package.json` (add devDependency `@resvg/resvg-js`; add `build:badge` script)
- Generated (commit): `app/icon.svg`, `public/badge/queritae.svg`, `public/badge/queritae-{ink,white}.png`, `public/badge/queritae-{ink,white}@2x.png`
- Test: `tests/lib/brand/badge-assets.test.ts`, `tests/scripts/build-badge-output.test.ts`

**Interfaces:**
- Consumes: `queritaeMarkSvg` (Task 1).
- Produces: `svgAssets(): { file: string; svg: string }[]` and
  `pngAssets(): { file: string; svg: string; width: number }[]`, plus color consts
  `BADGE_INK`, `BADGE_WHITE`, `BRAND_CYAN`.

- [ ] **Step 1: Add the dev-only rasterizer**

Run: `pnpm add -D @resvg/resvg-js`
Expected: `@resvg/resvg-js` added under `devDependencies` in `package.json`.

- [ ] **Step 2: Write the failing manifest test**

```ts
// tests/lib/brand/badge-assets.test.ts
import { describe, it, expect } from "vitest";
import { svgAssets, pngAssets } from "@/lib/brand/badge-assets";

describe("badge asset manifest", () => {
  it("emits the favicon and the vector badge as svg files", () => {
    const files = svgAssets().map((a) => a.file);
    expect(files).toContain("app/icon.svg");
    expect(files).toContain("public/badge/queritae.svg");
  });

  it("emits ink + white pngs at 1x and 2x", () => {
    const files = pngAssets().map((a) => a.file).sort();
    expect(files).toEqual([
      "public/badge/queritae-ink.png",
      "public/badge/queritae-ink@2x.png",
      "public/badge/queritae-white.png",
      "public/badge/queritae-white@2x.png",
    ]);
    const twoX = pngAssets().find((a) => a.file.endsWith("@2x.png"));
    expect(twoX?.width).toBe(96);
    const oneX = pngAssets().find((a) => a.file === "public/badge/queritae-ink.png");
    expect(oneX?.width).toBe(48);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test tests/lib/brand/badge-assets.test.ts`
Expected: FAIL — cannot resolve `@/lib/brand/badge-assets`.

- [ ] **Step 4: Write the manifest module**

```ts
// lib/brand/badge-assets.ts
import { queritaeMarkSvg } from "@/lib/brand/queritae-mark";

export const BADGE_INK = "#0f172a";
export const BADGE_WHITE = "#ffffff";
export const BRAND_CYAN = "#22d3ee";

export interface SvgAsset { file: string; svg: string; }
export interface PngAsset { file: string; svg: string; width: number; }

/** SVG files written verbatim: the favicon (brand cyan, visible on any tab) and
 *  the downloadable vector badge (ink). */
export function svgAssets(): SvgAsset[] {
  return [
    { file: "app/icon.svg", svg: queritaeMarkSvg({ lockup: "tile", color: BRAND_CYAN, size: 32 }) },
    { file: "public/badge/queritae.svg", svg: queritaeMarkSvg({ lockup: "tile", color: BADGE_INK, size: 96 }) },
  ];
}

/** PNGs rasterized for email clients: ink + white, 1x (48px) and 2x (96px). */
export function pngAssets(): PngAsset[] {
  const out: PngAsset[] = [];
  for (const [name, color] of [["ink", BADGE_INK], ["white", BADGE_WHITE]] as const) {
    const svg = queritaeMarkSvg({ lockup: "tile", color, size: 96 });
    out.push({ file: `public/badge/queritae-${name}.png`, svg, width: 48 });
    out.push({ file: `public/badge/queritae-${name}@2x.png`, svg, width: 96 });
  }
  return out;
}
```

- [ ] **Step 5: Run manifest test to verify it passes**

Run: `pnpm test tests/lib/brand/badge-assets.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Write the build script**

```ts
// scripts/build-badge.ts
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import { svgAssets, pngAssets } from "../lib/brand/badge-assets";

const root = fileURLToPath(new URL("..", import.meta.url));

function write(rel: string, data: string | Uint8Array): void {
  const abs = resolve(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, data);
  console.log(`  ✓ ${rel}`);
}

console.log("Building Queritae badge assets…");
for (const a of svgAssets()) write(a.file, a.svg);
for (const a of pngAssets()) {
  const png = new Resvg(a.svg, { fitTo: { mode: "width", value: a.width } }).render().asPng();
  write(a.file, png);
}
console.log("Done.");
```

- [ ] **Step 7: Add the package script**

In `package.json` `scripts`, add (alphabetical neighbors are fine — place after `"build"`):

```json
    "build:badge": "tsx scripts/build-badge.ts",
```

- [ ] **Step 8: Generate the assets**

Run: `pnpm build:badge`
Expected: prints `✓ app/icon.svg`, `✓ public/badge/queritae.svg`, and four `✓ public/badge/queritae-*.png` lines, then `Done.`

- [ ] **Step 9: Write the generated-output test**

```ts
// tests/scripts/build-badge-output.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

describe("generated badge assets", () => {
  it("ships app/icon.svg", () => {
    expect(existsSync(`${root}/app/icon.svg`)).toBe(true);
  });

  for (const f of [
    "queritae-ink.png",
    "queritae-ink@2x.png",
    "queritae-white.png",
    "queritae-white@2x.png",
  ]) {
    it(`${f} exists and is a valid png`, () => {
      const p = `${root}/public/badge/${f}`;
      expect(existsSync(p)).toBe(true);
      const buf = readFileSync(p);
      expect(buf.length).toBeGreaterThan(0);
      expect(buf.subarray(0, 4).equals(PNG_SIG)).toBe(true);
    });
  }
});
```

- [ ] **Step 10: Run the output test**

Run: `pnpm test tests/scripts/build-badge-output.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 11: Commit (including generated assets)**

```bash
git add lib/brand/badge-assets.ts scripts/build-badge.ts package.json pnpm-lock.yaml \
  tests/lib/brand/badge-assets.test.ts tests/scripts/build-badge-output.test.ts \
  app/icon.svg public/badge
git commit -m "feat(brand): generate favicon + badge png/svg assets"
```

---

### Task 4: Public serving — middleware bypass + long cache header

**Files:**
- Modify: `middleware.ts:69-71` (matcher)
- Modify: `next.config.ts` (`headers()`)
- Test: `tests/app/badge-serving.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `/badge/*` served as a public, CDN-cacheable static asset (no CSP/auth middleware).

- [ ] **Step 1: Write the failing test**

```ts
// tests/app/badge-serving.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import nextConfig from "@/next.config";

const root = fileURLToPath(new URL("../..", import.meta.url));

describe("badge serving", () => {
  it("middleware matcher excludes /badge so the image is public", () => {
    const src = readFileSync(`${root}/middleware.ts`, "utf8");
    expect(src).toMatch(/matcher[\s\S]*badge/);
  });

  it("badge assets get a long immutable cache header", async () => {
    const headers = await nextConfig.headers!();
    const badge = headers.find((h) => h.source.startsWith("/badge"));
    expect(badge).toBeDefined();
    expect(
      badge!.headers.some((x) => x.key === "Cache-Control" && x.value.includes("immutable")),
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/app/badge-serving.test.ts`
Expected: FAIL — matcher has no `badge`; no `/badge` header entry.

- [ ] **Step 3: Update the middleware matcher**

In `middleware.ts`, change the matcher line:

```ts
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|badge|icon.svg).*)",
  ],
```

- [ ] **Step 4: Add the cache header in `next.config.ts`**

Replace the `headers()` method body so it returns both entries:

```ts
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      {
        source: "/badge/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test tests/app/badge-serving.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add middleware.ts next.config.ts tests/app/badge-serving.test.ts
git commit -m "feat(brand): serve /badge as a public immutable static asset"
```

---

### Task 5: Admin "Email signature" settings page, panel, and nav entry

**Files:**
- Create: `app/[username]/admin/settings/signature/page.tsx`
- Create: `components/admin/sections/signature-panel.tsx`
- Modify: `components/admin/admin-rail.tsx` (add `signature` icon + Settings nav item)
- Test: `tests/components/admin/signature-panel.test.tsx`

**Interfaces:**
- Consumes: `queritaeMarkSvg` (Task 1); `buildSignatureSnippet`, `BadgeColor` (Task 2);
  `requireAdminAccount` (`@/lib/admin/require-admin`), `resolveProfileUrl` (`@/lib/cv/profile-url`),
  `PageHeader` (`@/components/admin/page-header`).
- Produces: route `/[username]/admin/settings/signature`; `SignaturePanel({ profileUrl, origin })`.

- [ ] **Step 1: Write the failing panel test**

```tsx
// tests/components/admin/signature-panel.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SignaturePanel } from "@/components/admin/sections/signature-panel";

describe("SignaturePanel", () => {
  beforeEach(() => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  });

  it("shows the ink snippet by default and switches to white", async () => {
    render(<SignaturePanel profileUrl="https://queritae.com/alex" origin="https://queritae.com" />);
    const box = screen.getByLabelText(/paste this into your email signature/i) as HTMLTextAreaElement;
    expect(box.value).toContain("queritae-ink.png");
    expect(box.value).toContain("alex?ref=signature");

    await userEvent.click(screen.getByRole("button", { name: /^white$/i }));
    expect(box.value).toContain("queritae-white.png");
  });

  it("copies the snippet to the clipboard and confirms", async () => {
    render(<SignaturePanel profileUrl="https://queritae.com/alex" origin="https://queritae.com" />);
    await userEvent.click(screen.getByRole("button", { name: /^copy$/i }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining("queritae-ink.png"));
    expect(await screen.findByText("Copied")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/components/admin/signature-panel.test.tsx`
Expected: FAIL — cannot resolve `@/components/admin/sections/signature-panel`.

- [ ] **Step 3: Write the panel**

```tsx
// components/admin/sections/signature-panel.tsx
"use client";

import { useState } from "react";
import { queritaeMarkSvg } from "@/lib/brand/queritae-mark";
import { buildSignatureSnippet, type BadgeColor } from "@/lib/brand/signature-snippet";

const COLOR_HEX: Record<BadgeColor, string> = { ink: "#0f172a", white: "#ffffff" };

/**
 * Account-facing panel that previews the Queritae badge and emits a ready-to-
 * paste email-signature snippet. Presentational + self-contained: the host page
 * passes the already-resolved profile URL and platform origin.
 */
export function SignaturePanel({ profileUrl, origin }: { profileUrl: string; origin: string }) {
  const [color, setColor] = useState<BadgeColor>("ink");
  const [copied, setCopied] = useState<string | null>(null);

  const snippet = buildSignatureSnippet({ profileUrl, origin, color });

  const copy = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* clipboard unavailable — leave the value on screen to copy manually */
    }
  };

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex gap-3">
        <Swatch tone="light" html={queritaeMarkSvg({ lockup: "tile", color: COLOR_HEX[color], size: 48, id: "q-light" })} />
        <Swatch tone="dark" html={queritaeMarkSvg({ lockup: "tile", color: COLOR_HEX[color], size: 48, id: "q-dark" })} />
      </div>

      <div className="flex items-center gap-2">
        <span className="text-control text-[var(--color-text-secondary)]">Badge colour</span>
        {(["ink", "white"] as BadgeColor[]).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setColor(c)}
            aria-pressed={color === c}
            className={
              "rounded-md border px-3 py-1 text-control capitalize transition-colors " +
              (color === c
                ? "border-[var(--color-accent)] text-[var(--color-accent)]"
                : "border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]")
            }
          >
            {c}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="sig-snippet" className="text-control text-[var(--color-text-secondary)]">
          Paste this into your email signature
        </label>
        <textarea
          id="sig-snippet"
          readOnly
          value={snippet}
          rows={4}
          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-3 font-mono text-2xs text-[var(--color-text-primary)]"
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => copy("snippet", snippet)}
            className="rounded-md border border-[var(--color-accent)] px-3 py-1.5 text-control text-[var(--color-accent)] transition-opacity hover:opacity-90"
          >
            {copied === "snippet" ? "Copied" : "Copy"}
          </button>
          <a
            href={`/badge/queritae-${color}.png`}
            download
            className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-control text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-primary)]"
          >
            Download PNG
          </a>
          <button
            type="button"
            onClick={() => copy("svg", queritaeMarkSvg({ lockup: "tile", color: COLOR_HEX[color] }))}
            className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-control text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-primary)]"
          >
            {copied === "svg" ? "Copied" : "Copy SVG"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Swatch({ tone, html }: { tone: "light" | "dark"; html: string }) {
  return (
    <div
      className="flex h-20 w-28 items-center justify-center rounded-lg border border-[var(--color-border)]"
      style={{ background: tone === "light" ? "#ffffff" : "#0b1220" }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/components/admin/signature-panel.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the server page**

```tsx
// app/[username]/admin/settings/signature/page.tsx
import { requireAdminAccount } from "@/lib/admin/require-admin";
import { resolveProfileUrl } from "@/lib/cv/profile-url";
import { PageHeader } from "@/components/admin/page-header";
import { SignaturePanel } from "@/components/admin/sections/signature-panel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function siteOrigin(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export default async function SignatureSettingsPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const account = await requireAdminAccount(username);
  const profileUrl = await resolveProfileUrl({ accountId: account.id, username: account.username });

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Email signature"
        description="Add a Queritae badge that links to your profile from your email signature."
      />
      <SignaturePanel profileUrl={profileUrl} origin={siteOrigin()} />
    </>
  );
}
```

- [ ] **Step 6: Add the nav entry + icon in `components/admin/admin-rail.tsx`**

6a. Extend the `IconName` union (line 9) to include `"signature"`:

```ts
type IconName = "conversations" | "questions" | "analytics" | "content" | "domains" | "billing" | "signature";
```

6b. Add the item to the **Settings** group's `items` array (after the Billing item):

```ts
        { href: `${adminBasePath}/settings/signature`, label: "Email signature", icon: "signature" },
```

6c. Add the glyph to the `GLYPHS` record (an envelope, matching the line-glyph convention):

```tsx
  signature: (
    <>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </>
  ),
```

- [ ] **Step 7: Type-check and run the full suite**

Run: `pnpm typecheck && pnpm test`
Expected: typecheck clean; all tests PASS.

- [ ] **Step 8: Verify in the running app (preview tool)**

Start the dev server, sign in to an account admin, and navigate to
`/<username>/admin/settings/signature`. Confirm: the **Email signature** rail entry
appears and is active; both preview swatches render the Q; the ink/white toggle updates
the swatches and the snippet; **Copy** shows "Copied"; **Download PNG** downloads the file;
the browser tab shows the new favicon. Capture a screenshot as proof.

- [ ] **Step 9: Commit**

```bash
git add app/[username]/admin/settings/signature/page.tsx \
  components/admin/sections/signature-panel.tsx \
  components/admin/admin-rail.tsx \
  tests/components/admin/signature-panel.test.tsx
git commit -m "feat(admin): email-signature settings panel + nav entry"
```

---

## Self-Review

**Spec coverage:**
- §1 The mark → Task 1 (`queritaeMarkSvg`, tile + glyph lockups). ✓
- §2 Hosting (PNG + SVG, build script, `public/badge/`) → Task 3. ✓
- §2 Favicon `app/icon.svg` → Task 3 (svgAssets). ✓
- §4 Middleware bypass + long cache → Task 4. ✓
- §3/§5 Per-user snippet (`resolveProfileUrl`, `?ref=signature`, platform origin) → Task 2 + Task 5 page. ✓
- §6 Admin Signature panel (preview light/dark, ink/white toggle, Copy / Download PNG / Copy SVG, rail entry) → Task 5. ✓
- §Testing (unit on mark + snippet; asset sanity; panel render) → Tasks 1, 2, 3, 5. ✓
- Out-of-scope (cyan badge variant, icon+handle lockup, size picker, public share) → intentionally absent. ✓

**Placeholder scan:** No TBD/TODO; every code step carries full code and exact run commands. ✓

**Type consistency:** `BadgeColor` ("ink"|"white") is defined in Task 2 and consumed in Task 5; `QueritaeMarkOptions`/`id` defined in Task 1 and used by Task 3 (assets) and Task 5 (panel, unique ids `q-light`/`q-dark`); `svgAssets`/`pngAssets` shapes defined in Task 3 and consumed by the build script in the same task. Favicon uses `BRAND_CYAN`; badge PNGs use `BADGE_INK`/`BADGE_WHITE` per the Global Constraints. ✓
