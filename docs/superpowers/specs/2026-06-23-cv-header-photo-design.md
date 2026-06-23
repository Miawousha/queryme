# CV header — optional profile photo

**Date:** 2026-06-23
**Status:** Approved design, pending implementation plan
**Scope:** Render an optional circular profile photo in the CV header, leading the
identity row. Purely additive — the no-photo header is byte-for-byte today's layout.

## Goal

Let an account show a portrait at the top of its CV when `profile.photo` is set,
and render gracefully (unchanged) when it is not. The header already varies on a
second axis — the QR block shows on the standalone `/cv` page but not in the
embedded/modal view — so the photo must look right across all four combinations
of {photo? × QR?}.

## Decisions

| Question | Decision |
| --- | --- |
| Photo source | `profile.photo` only (existing schema field). No GitHub-avatar fallback — "no photo" stays a real, first-class state. |
| Value format | An absolute `https://…` URL (or root-relative path). Rendered as a plain `<img src>` — no `next/image`, no remote-pattern config, no new serving route. |
| Layout | **Option A** — circular avatar leads the row; identity (name/headline/bio/contacts) sits beside it; QR block stays far right, unchanged. |
| Shape / size | Circle, `h-20 w-20` (80px), `object-cover`, hairline `var(--color-border)` ring. |
| Surfaces | Everywhere the header renders (standalone `/cv` **and** the embedded/modal view). Falls out for free — the component reads `kb.profile.photo` independently of the QR props. |
| Print | Reuse the existing `print.css` as-is. No new rule. The photo prints in color under the existing `print-color-adjust: exact`; the avatar's `ring-[var(--color-border)]` flips to the light ink-on-paper border automatically via the print token override. |

## Changes

### 1. Schema — no change

`lib/kb/schemas.ts:21` already declares `photo: z.string().optional()` on
`ProfileSchema`, and it already flows through `kb.profile.photo` to the renderer.
We keep `z.string()` (not `z.url()`) so both absolute URLs and root-relative
paths validate; the expected value is documented as an absolute `https` URL.

### 2. Component — `components/cv/cv-document.tsx`

In `CvDocumentView`'s `<header>` (currently `cv-document.tsx:133`), wrap the
avatar and the existing identity column in one inner flex so the QR block keeps
its place on the right:

```tsx
<div className="flex items-start justify-between gap-6">
  <div className="flex min-w-0 flex-1 items-start gap-5">
    {kb.profile.photo && (
      <img
        src={kb.profile.photo}
        alt={t.photoAlt.replace("{name}", kb.profile.name)}
        className="cv-photo h-20 w-20 shrink-0 rounded-full object-cover ring-1 ring-[var(--color-border)]"
      />
    )}
    <div className="min-w-0 flex-1">
      {/* name / headline / bio / contacts — unchanged */}
    </div>
  </div>
  {profileUrl && qrSvg && (
    {/* QR block — unchanged */}
  )}
</div>
```

State behaviour (all four proven in the brainstorm mockup):

- **photo + QR** (`/cv`): avatar left, identity centre, QR right.
- **photo, no QR** (modal): avatar left, identity flows wide to the right.
- **no photo + QR** (`/cv`): inner wrapper holds only the identity column →
  identical to today's header.
- **no photo, no QR** (modal): identical to today's header.

Vertical alignment: `items-start` aligns the avatar top with the name; nudge with
a small top margin only if the cap-height optical alignment looks off in preview.

### 3. Strings — `lib/cv/strings.ts`

Add a localized `photoAlt` template next to the existing `qrAlt`, in both locales:

- `en`: `photoAlt: "Portrait of {name}"`
- `fr`: `photoAlt: "Portrait de {name}"`

Rendered via `t.photoAlt.replace("{name}", kb.profile.name)`.

### 4. Print — no change

`components/cv/print.css` already handles the printed CV: light ink-on-paper
token override scoped to `.cv-page`, `print-color-adjust: exact`, A4 page box,
break rules. The photo needs nothing new — it prints in color, and its ring uses
the border token that already flips for print. (`.cv-photo` is added as a class
hook only so a future print tweak has a selector; no rule is shipped now.)

## Error handling & edges

- **Broken URL:** shows the browser's native missing-image state. The content is
  author-controlled and the breakage is immediately visible to the author on
  their own CV — no runtime risk, no server error. No `onError` handler (would
  force a client boundary in this server component for negligible benefit).
- **Responsive:** at mobile width the 80px avatar holds via `shrink-0` while the
  identity column reflows; the `/cv` column is `max-w-3xl`. Verify in preview at
  a narrow viewport; allow the row to wrap only if it actually crowds.

## Testing

A render test for `CvDocumentView` asserting:

1. With `profile.photo` set → an `<img>` renders with the correct `src` and a
   non-empty `alt` containing the profile name.
2. Without `profile.photo` → no `<img>` in the header.
3. Both of the above hold regardless of whether the QR props are passed (the
   photo is independent of the QR).

Verification gates are `npm run typecheck` (tsc) and `npm test` (vitest) plus a
preview pass. The repo has no ESLint config or `lint` script, so a plain `<img>`
is safe — there is no `@next/next/no-img-element` rule to break the build.

## Out of scope

- GitHub-avatar fallback / any non-`profile.photo` source.
- Serving local image files from the content repo (a new image route).
- `next/image` optimization, cropping/focal-point controls, multiple photos.
- Any change to the QR block, the modal chrome, or other CV sections.
```
