# CV → QR code linking to the live profile

**Date:** 2026-06-22
**Status:** Design — awaiting review

## Summary

Add a QR code (with the URL printed beneath it) to the **printable CV** that points to
the owner's live profile **home** (`/`) at their **configured custom domain** when one is
verified, falling back to the platform URL otherwise. The QR lives on the standalone `/cv`
surface only; the in-app CV modal is unchanged.

## Decisions (settled)

| Question | Decision |
| --- | --- |
| What does the QR/link target? | The account's **active custom domain** if one exists; else the platform URL. |
| Destination path | **Profile home (`/`)** — the interactive, queryable profile, not `/cv`. |
| Placement | The **standalone printable CV** surface; **not** the in-app modal. |
| QR generation | Add the **`qrcode`** dependency; render an inline **SVG** server-side. |

## Canonical profile URL

The custom-domain feature already vanity-hosts the profile home and `/cv` on a verified
custom host (`lib/domains/host.ts`, `customHostTarget`). So the QR target is simply the
**root** of the canonical host.

New helper — `lib/cv/profile-url.ts`:

```
resolveProfileUrl({ accountId, username }): Promise<string>
  1. Under PERSONA_LOCAL_OVERRIDE → skip the DB, return the fallback (mirrors
     lib/accounts/root.ts).
  2. Look up domains for accountId (repo.listDomainsByAccount — no Vercel call).
     Pick the oldest with status === "active":
        → return `https://${hostname}`
  3. Fallback:
        → username ? `${siteOrigin()}/${username}` : siteOrigin()
```

- `siteOrigin()` reads `NEXT_PUBLIC_SITE_URL` (trailing slash trimmed), same pattern as
  `lib/auto-sync/url.ts:7`. Default `http://localhost:3000` in dev.
- Uses `repo.listDomainsByAccount` directly (not `service.listDomainsForAccount`) to avoid
  the Vercel API round-trip in `toView`/status refresh.
- Multiple active domains: deterministic — oldest by `createdAt` (the repo already orders
  by `createdAt`).

## QR generation

New thin wrapper — `lib/cv/qr.ts`:

```
qrSvg(url: string): Promise<string | null>
  try   → QRCode.toString(url, { type: "svg", margin: 0, errorCorrectionLevel: "M" })
  catch → null   // never break CV rendering over a QR failure
```

- Add `qrcode` (and `@types/qrcode` dev) to `package.json`. Pure JS, MIT, runs on Vercel
  serverless.
- SVG output: crisp at any print scale, no client JS, no third-party image endpoint
  (prints offline).
- The wrapper post-processes the SVG so the modules use `currentColor` (strip/replace the
  library's hard-coded `#000`/`fill`), and the background is transparent. This makes the
  QR **theme-adaptive**: light modules on the dark on-screen standalone view, dark modules
  on white in print (print.css already flips the CV palette, redefining `--color-*`
  tokens). A small quiet zone is preserved via the surrounding layout padding.

## Rendering & placement

`CvDocumentView` gains two **optional** props: `profileUrl?: string` and `qrSvg?: string`.
- When both are present, render a QR block at the **top-right of the header** (`<header>`
  in `cv-document.tsx`): the inline SVG (via `dangerouslySetInnerHTML`, fixed ~84px box)
  with the scheme-stripped URL beneath it in the existing mono-tertiary treatment.
- When absent (the modal path), render nothing.

`CvDocumentView` stays a **synchronous** component because it is shared with the client
modal path (`CvDocumentClient`). All async work (URL resolution + SVG generation) happens
in the server pages and is passed down as props.

Wiring:
- `app/[username]/cv/page.tsx`: after loading `account`, call
  `resolveProfileUrl({ accountId: account.id, username: account.username })` →
  `qrSvg(url)`; pass `profileUrl` + `qrSvg` into `CvStandalone`.
- `app/cv/page.tsx` (root account): resolve with `{ accountId: rootAccountId }` and no
  username → URL falls back to `siteOrigin()`. Pass through the same way.
- `CvStandalone` forwards both props to `CvDocumentView`.
- The modal (`cv-modal.tsx` → `CvDocumentClient`) passes neither → **no API change**.

### Interpretation of "print/PDF only"

The QR renders on the standalone `/cv` surface — visible both in its on-screen preview and
in the printed/PDF output — and is absent from the in-app modal. If strictly
print-invisible-on-screen is wanted later, add a `cv-print-only` class
(`display:none` on screen; shown inside `@media print`). Deferred unless requested.

## Error handling

- `qrSvg` returns `null` on any failure → header renders without a QR (no throw).
- `resolveProfileUrl` never throws: a domains lookup error falls through to the platform
  fallback (wrap the DB read in try/catch, return fallback on error — fails open, matching
  `resolveCustomHost`).

## Testing

- `lib/cv/profile-url` unit tests: active-domain wins; pending/error domains ignored;
  oldest-active chosen among several; fallback uses `${SITE_URL}/${username}`; override
  short-circuits to fallback; DB error falls through to fallback.
- `lib/cv/qr` unit test: returns an `<svg …>` string for a URL; uses `currentColor`;
  returns `null` if the encoder throws (mock).
- `components/cv/cv-document` render test: QR present (with `profileUrl`+`qrSvg`) and the
  URL text shown; QR absent when props omitted (guards the modal path).

## Files touched

- `lib/cv/profile-url.ts` (new)
- `lib/cv/qr.ts` (new)
- `components/cv/cv-document.tsx`
- `components/cv/cv-standalone.tsx`
- `app/[username]/cv/page.tsx`
- `app/cv/page.tsx`
- `package.json` (+ `qrcode`, `@types/qrcode`)
- tests as above

## Out of scope (YAGNI)

- QR/link in the in-app CV modal (no API plumbing).
- Per-owner toggle to show/hide the QR.
- Encoding `/cv` instead of `/` (structure leaves this a one-line change later).
- Logo-in-QR / styled QR.
