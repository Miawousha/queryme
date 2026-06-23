# Queritae signature badge

**Date:** 2026-06-23
**Status:** Design — awaiting review

## Summary

Give every account a **Queritae brand mark** they can drop into an email signature —
the same idea as the GitHub / LinkedIn icons people link from their signatures. The
icon is a single, recognizable, **monochrome** mark; the **link** is per-user (their
profile home). Ship the full flow: the mark itself, a centrally-hosted badge image,
and an in-app **Signature** panel that hands the user a ready-to-paste HTML snippet
with their own link baked in.

The product has no dedicated glyph today — only a lowercase `queritae` wordmark pill
([components/queritae-cta.tsx](components/queritae-cta.tsx)) — and the app currently
ships **no favicon**. This work produces both as a byproduct.

## Decisions (settled)

| Question | Decision |
| --- | --- |
| Glyph concept | A **"Q" + terminal-cursor** mark — the Q says Queritae, the cursor block doubles as the Q-tail and a terminal cursor (the "queryable terminal" identity). |
| Treatment | **Monochrome, single ink color, fully recolorable** — like the official embeddable social marks, not a multi-color tile. |
| Primary lockup | **Solid tile**: a solid rounded-square with the Q+cursor knocked out as negative space. Recolors as one fill; most legible at 24px. |
| Second lockup | **Bare glyph** (no tile), derived from the same core glyph. Served too, but the snippet defaults to the tile. |
| Image format | **Pre-rendered PNG** at an absolute URL (email clients strip SVG + inline CSS). SVG also served for vector users. |
| Colors shipped | **ink** (`#0f172a`, for light signatures) and **white** (`#ffffff`, for dark signatures). |
| Hosting origin | Served from the **platform origin** (`NEXT_PUBLIC_SITE_URL`, e.g. `queritae.com`), never the user's custom domain — one cacheable asset for everyone. |
| Per-user link | The account's profile home via the existing `resolveProfileUrl()`, with a `?ref=signature` attribution param. |
| Panel location | New **Signature** subsection under `app/[username]/admin/settings/signature/`, sibling to billing / content / domains. |
| Favicon | Add `app/icon.svg` from the same mark (the app has none today). |

## Out of scope for v1 (easy to add later)

- A brand-cyan (`#22d3ee`) color variant.
- An "icon + handle" labeled lockup (icon next to `queritae.com/<user>` text).
- A badge size picker (fixed at 24px displayed / 48px rendered for v1).
- A public-profile share affordance (panel is admin-only for v1).

## Architecture

Single source of truth for the mark → everything else is generated from it.

```
lib/brand/queritae-mark.ts        the canonical mark (one parametric SVG)
        │
        ├── app/icon.svg          favicon (static, hand-exported from the mark)
        ├── scripts/build-badge.ts → public/badge/*.png + queritae.svg   (committed assets)
        └── components/admin/sections/signature-panel.tsx  (in-app preview, reuses the SVG)
```

### 1. The mark — `lib/brand/queritae-mark.ts`

One pure function, no dependencies, returns an SVG string:

```
queritaeMarkSvg(opts: {
  lockup?: "tile" | "glyph";   // default "tile"
  color?: string;              // any CSS color; default "#0f172a"
  size?: number;               // px, default 96
}): string
```

- `tile`: solid rounded-square (`color`) with the Q-ring + cursor block knocked out as
  true transparency (via `fill-rule="evenodd"` on a single path, or a `<mask>`), so the
  whole mark is one fill and recolors cleanly.
- `glyph`: the same Q-ring + cursor as a solid shape in `color`, no tile, transparent
  background.
- Geometry is the v2 monochrome design already validated visually: a bold ring
  (knockout weight ≈ 11/96) with a cursor block at the lower-right that reads as both
  the Q-tail and a terminal cursor. Authored on a 96-unit grid, scaled by `size`.

This function is the only place glyph geometry is defined. The build script and the
admin preview both call it.

### 2. Favicon — `app/icon.svg`

A static SVG exported from `queritaeMarkSvg({ lockup: "tile", color: "#0f172a", size: 32 })`
(checked in, not generated at request time). Next's App Router picks up `app/icon.svg`
automatically for `<link rel="icon">`. White-on-dark is unnecessary — modern browsers
handle the favicon background.

### 3. Hosted badge assets — `scripts/build-badge.ts` → `public/badge/`

A standalone, agent-runnable script (mirrors the project's agent-first tooling
convention) that rasterizes the canonical SVG to committed static files:

```
public/badge/
  queritae.svg            vector (tile, ink) for anyone who wants it
  queritae-ink.png        48×48 rendered, displayed at 24    (light signatures)
  queritae-ink@2x.png     96×96 rendered                     (retina)
  queritae-white.png      48×48
  queritae-white@2x.png   96×96
```

- The script imports `queritaeMarkSvg()` and rasterizes via a **dev-only** rasterizer
  (`@resvg/resvg-js` preferred; confirm/choose during planning — must not become a
  runtime dependency). PNGs are committed so production serves pure static files: no
  function invocation, CDN-cached, reliable for email clients.
- `package.json` gains a `build:badge` script. The assets are regenerated by running it,
  not at request time.

`public/` does not exist yet — it will be created. Standard Next static serving applies.

### 4. Serving — middleware + headers

- `middleware.ts` matcher currently is
  `"/((?!api|_next/static|_next/image|favicon.ico).*)"`. Add `badge` (and `icon.svg`) to
  the negative lookahead so badge requests skip the CSP/auth middleware entirely — the
  image must be publicly fetchable, cross-origin, by email clients.
- Add a long-lived `Cache-Control` (e.g. `public, max-age=31536000, immutable`) for
  `/badge/*` via `next.config.ts` `headers()`. The mark is versioned by filename if it
  ever changes.

### 5. Per-user snippet

The per-user part is purely the **link**; the image is shared. The panel builds:

```html
<a href="{profileUrl}?ref=signature">
  <img src="{origin}/badge/queritae-{color}.png"
       alt="Queritae" width="24" height="24" style="border:0">
</a>
```

- `profileUrl` ← `resolveProfileUrl({ accountId, username })`
  ([lib/cv/profile-url.ts](lib/cv/profile-url.ts)) — prefers a verified custom domain,
  else the platform URL. Reused as-is.
- `origin` ← `NEXT_PUBLIC_SITE_URL` (trailing slash trimmed), the same helper pattern
  `resolveProfileUrl` already uses. The image always comes from the platform origin so
  it is one cacheable asset, even for custom-domain users.
- `color` ← the panel's ink/white toggle.
- A small pure builder, `lib/brand/signature-snippet.ts` →
  `buildSignatureSnippet({ profileUrl, origin, color }): string`, so the exact string is
  unit-testable and identical between server render and clipboard copy.

### 6. Admin UI — `app/[username]/admin/settings/signature/`

- `page.tsx` (server): resolves the account (mirroring the sibling settings pages),
  computes `profileUrl` + `origin`, renders the panel. Follows the existing
  `PageHeader` / settings-section conventions
  ([components/admin/page-header.tsx](components/admin/page-header.tsx)).
- `components/admin/sections/signature-panel.tsx` (client):
  - live preview of the badge on a **light and a dark swatch** (renders
    `queritaeMarkSvg()` inline so the preview needs no network),
  - an **ink / white** color toggle,
  - a primary **Copy** button (copies the HTML snippet; transient "Copied" state),
  - secondary **Download PNG** + **Copy SVG** actions for power users,
  - a one-line "paste into your email signature" helper.
- Add a nav entry in the settings rail alongside billing / content / domains
  (hand-rolled SVG icon, no icon library — per the admin design language).

## Data flow

```
queritaeMarkSvg()  ──►  app/icon.svg               (favicon, static)
        │
        ├─►  scripts/build-badge.ts  ──►  public/badge/*.png|svg   (committed, CDN-cached)
        │                                      ▲
        │                                      │  <img src> in email
        └─►  signature-panel preview           │
                                               │
buildSignatureSnippet({profileUrl, origin, color})
   profileUrl ← resolveProfileUrl(account)     │
   origin     ← NEXT_PUBLIC_SITE_URL ───────────┘
        │
        ▼
   Copy → user's clipboard → email signature
```

## Error handling & edge cases

- `resolveProfileUrl` already fails open to the platform URL and never throws; the panel
  inherits that — it always produces a working snippet.
- Clipboard: feature-detect `navigator.clipboard`; fall back to selecting the snippet
  `<textarea>` so Copy degrades gracefully.
- Local dev (`PERSONA_LOCAL_OVERRIDE`, no DB): `resolveProfileUrl` returns the fallback
  URL — the panel still renders and copies a valid (localhost) snippet.
- Missing `NEXT_PUBLIC_SITE_URL`: falls back to `http://localhost:3000` (existing helper
  behavior); acceptable for dev, correct in prod where the env is set.

## Testing

- **Unit** — `queritaeMarkSvg()`: returns valid SVG, honors `lockup`/`color`/`size`,
  knockout produces transparency (assert structure, not pixels).
- **Unit** — `buildSignatureSnippet()`: exact-string / snapshot test for ink and white,
  with and without a custom-domain `profileUrl`, and that `?ref=signature` is appended.
- **Manual / preview tool** — the Signature panel: preview on both swatches, color
  toggle, Copy → paste round-trip, Download PNG, Copy SVG. Confirm `app/icon.svg` shows
  as the favicon.
- **Asset sanity** — generated PNGs are non-empty and the expected dimensions
  (48 / 96px); `queritae.svg` parses.

## Files touched

| File | Change |
| --- | --- |
| `lib/brand/queritae-mark.ts` | **new** — canonical parametric mark SVG. |
| `lib/brand/signature-snippet.ts` | **new** — pure snippet builder. |
| `app/icon.svg` | **new** — favicon from the mark. |
| `scripts/build-badge.ts` | **new** — rasterize mark → `public/badge/*`. |
| `public/badge/*` | **new** — committed PNG + SVG assets. |
| `app/[username]/admin/settings/signature/page.tsx` | **new** — settings subsection. |
| `components/admin/sections/signature-panel.tsx` | **new** — preview + copy UI. |
| settings nav rail | add **Signature** entry. |
| `middleware.ts` | exclude `badge` (+ `icon.svg`) from the matcher. |
| `next.config.ts` | long `Cache-Control` for `/badge/*`. |
| `package.json` | `build:badge` script; dev-only rasterizer dependency. |
| tests | unit tests for the two `lib/brand/*` modules. |
