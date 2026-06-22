# KB tree UI refresh — design

**Date:** 2026-06-22
**Status:** approved (brainstorm with Alexandre, 2026-06-22)

## Problem

The chat-page KB tree ([components/kb/kb-tree.tsx](../../../components/kb/kb-tree.tsx),
[components/kb/kb-panel.tsx](../../../components/kb/kb-panel.tsx)) is functionally
rich but visually noisy:

- Citations are signalled three ways at once — a cited tint, a trailing
  accent dot, and `[n]` chips — and the lens that focuses them is buried as a
  button sharing the cramped filter row.
- Every doc row carries an `MD`/`YAML`/… text badge; since almost everything
  is markdown, `MD MD MD` down the right edge is pure noise.
- Depth is pure left-padding (`depth * 14`) with no connective structure, so
  deep nesting is hard to scan.
- "What did *this answer* cite?" is harder to see than it should be — it is
  diffused across dots/tints/pulses rather than stated once.
- The header band ([kb-panel.tsx:74](../../../components/kb/kb-panel.tsx)) holds
  only a title + count; lots of dead space.

## Goal

A calmer, more legible tree that keeps the established mono-uppercase / cyan
terminal aesthetic, makes "sources in this answer" first-class, and reduces
per-row clutter — without changing the underlying tree model or citation
semantics.

## Decisions (from brainstorm)

- **Scope:** ship all of it in one PR — six visual refinements + the Sources
  strip + hover/peek preview + a density toggle.
- **Sources strip tracks the *latest answer*, auto-shown.** Not the whole
  conversation (the lens already covers that), not manual-only.
- **Citation visuals:** an accent "trail rail" replaces the per-row tint on
  *expanded* cited branches; a subtle tint stays only on the exact cited node.
  The trailing **dot stays**, doing only its real job: signalling "cited
  inside" on a *collapsed* container/doc (the rail cannot reach hidden
  children).
- **Peek is desktop/pointer-only**, positioned to the **left** of the panel
  (the panel hugs the right screen edge). Disabled on coarse/`hover: none`
  pointers, where tap-to-open is unchanged.
- **Density default = today's spacing** ("compact"), so there is no visual
  regression; "comfortable" is opt-in.
- **No "collapse-all"** control — out of scope (YAGNI).
- Aesthetic is preserved: no sentence-casing of labels, no softening of the
  mono identity. These are refinements *within* that language.

## Architecture / componentization

`kb-tree.tsx` is already ~500 lines. New behaviour lands in focused units:

| Unit | Responsibility |
|---|---|
| `components/kb/kb-sources-strip.tsx` | The "Sources · this answer" strip (presentational; reads `latestAnswer` + `manifest`). |
| `lib/kb/peek-extract.ts` | **Pure** extraction: given full doc text + a target (doc \| section slug), return `{ title, metaLine?, excerpt }`. No DOM, unit-tested directly. |
| `components/kb/kb-peek.tsx` | The floating preview card + hover/focus intent + fetch/cache wiring (uses `peek-extract`). |
| `lib/kb/use-kb-peek.ts` | Hook: open/close intent with delays, fetch-on-demand, module-level per-path text cache. |
| `components/kb/kb-file-glyph.tsx` | `KbFileType` → small inline-SVG glyph (matches the existing hand-rolled `Chevron`/toolbar icon style). |
| `lib/kb/use-kb-density.ts` | `"compact" \| "comfortable"`, persisted in `localStorage`. |

**View-control lift.** Only `filter` + `lens` move out of `useKbTreeState` up
to `KbPanel`, so the header band can host the cited pill and the filter can be
a full-width row above the tree. Expansion overrides, auto-reveal, and pulse
**stay** in `useKbTreeState`/`KbTree`. `KbTree` receives `filter` + `lens` as
props.

## UX specification

### B. Header band + filter

- Band: `KNOWLEDGE BASE · <count> ········· [◆ <n> cited] [density]`.
- **Cited pill** `◆ <n> cited` is the relocated lens toggle: `aria-pressed`,
  disabled when `lensCount === 0` (same enable rule as today — only refs whose
  path exists in the manifest count). Active state uses the existing accent
  treatment.
- **Density toggle** is a small icon button (compact ↔ comfortable).
- **Filter** moves to its own full-width row directly below the band, with a
  leading search glyph. `Escape` clears an active filter (and only then stops
  propagation, so a second `Escape` still closes the mobile drawer). The
  `/`-to-focus shortcut is **dropped** in this refresh — it lived on the tree
  container, which no longer owns the input; re-adding it on the panel is a
  documented follow-up (see the plan's "Known follow-up").

### C. Citation visuals

- **Trail rail:** a 2px `--color-accent` left bar spanning an *expanded* cited
  branch (the cited doc and its cited section descendants). Replaces the
  per-row tint on expanded branches.
- **Pinpoint tint:** a subtle `rgba(accent,0.06)` background stays on the
  *exact* cited node only (so you can still see which section).
- **Dot:** unchanged trigger (`!open && node.dot`) — shows on a collapsed
  container/doc whose descendant is cited. This is the only signal that
  survives collapse, so it stays.
- **Indent guides:** faint neutral 1px vertical rail per nesting level. The
  accent trail rail overrides the guide on the cited branch.
- **Chips:** render as the cleaner pill, pushed to the right margin. Chip click
  still jumps the chat to the citing message (`jumpToMessage`), unchanged.

### D. File glyphs

- Replace the text type badge with a small muted inline-SVG glyph.
- `KbFileType` is `md | yaml | html | pdf` (no other types exist). Glyph is
  **shown only for non-markdown** types (`yaml`, `html`, `pdf`); markdown → no
  glyph (the quiet default).
- Pinned virtual rows (`_virtual/…`) carry the same `KbFileType`, so they use
  the same type→glyph mapping; markdown pinned rows stay glyph-free as today.

### E. Sources strip (latest answer, auto-show)

- Sits above the pinned rows / tree, inside the scroll area.
- **Visible only when the latest answer cited ≥1 browseable source.** Hidden
  (renders nothing) otherwise.
- Header line: localized "Sources · this answer" label + count, and a collapse
  affordance. Collapsed state persisted in `sessionStorage`
  (`queritae:kbSources:<apiBasePath>`), per conversation/account.
- Each row: `[n] <DocTitle> › <Section>` (section omitted for whole-file
  refs). `n` is the global footnote index. Clicking the row opens the viewer
  at that `{ path, anchor }` (reuses `openFile`).
- Order: by global index ascending.

#### Data flow — `latestAnswer`

`citedRefs` records each pair's **first-appearance** message only, so the
latest answer cannot be derived from it (a follow-up re-citing an earlier
source would yield an empty strip). Therefore:

- In [chat.tsx](../../../components/chat.tsx) (which holds the raw messages),
  compute `latestAnswer: { messageId: string; refs: CitedRef[] } | null`:
  1. Find the most recent assistant message whose text has ≥1 citation.
  2. `parseCitations` that one message; for each cite build a `CitedRef` using
     the **global** index from `citationIndexMap(extractedRefs)` (so numbers
     match the chat superscripts and the tree chips). De-dupe within the
     message, preserve order.
- Expose `latestAnswer` + `setLatestAnswer` on `KbContext` alongside
  `citedRefs`. The strip reads only `latestAnswer` + `manifest`.
- Refs whose `path` is not in the manifest are dropped from the strip (not
  browseable), mirroring the lens-count rule.

### F. Peek preview (desktop / pointer only)

- **Trigger:** pointer hover **or** keyboard focus of a doc/section row.
  Open delay ~400ms, close delay ~120ms (cancel-on-reentry). Disabled when
  `matchMedia('(hover: none)')` matches — touch keeps tap-to-open.
- **Position:** a floating card to the **left** of the panel, vertically
  aligned to the row, clamped to the viewport.
- **Content** (from `peek-extract`):
  - doc → title + meta line (`role · company · date` when present) + first
    ~2 lines of body.
  - section → heading + body text down to the next heading.
- **Data:** fetch full doc text via the existing
  `/kb/file?path=…&lang=…` endpoint; cache in a module-level `Map<path,
  Promise<string>>`. Extract client-side via the shared `slugify`/section
  logic. Loading → skeleton; fetch error → no card (silent).
- Click still opens the full viewer (`openFile`), unchanged.
- Only `md`/`yaml` docs peek (the types that load as text today); `html`/`pdf`
  rows do not show a peek card.

### G. Density

- Two modes: `compact` (today's spacing, **default**) and `comfortable`
  (more row padding / line-height).
- Persisted in `localStorage` under `queritae:kbDensity` (global, like
  `queritae:kbPanelWidth`).
- Applied as a `data-density` attribute on the tree container; spacing driven
  by CSS in `app/globals.css`. Compact must equal current pixel spacing.

### Mobile

The panel is a full-screen drawer on mobile. Header pill, density toggle,
full-width filter, indent guides, trail rail, glyphs, and the sources strip
all apply unchanged. Peek is disabled (coarse pointer).

### i18n

New keys in [lib/language.ts](../../../lib/language.ts) (en + fr):

- `sourcesTitle` (e.g. "Sources · this answer" / "Sources · cette réponse"),
- `sourcesCollapseAria` / `sourcesExpandAria`,
- `density` label + `densityCompact` / `densityComfortable` aria,
- `citedPillAria` (replaces / supplements `referencedLensAria`),
- `peekLoading` (sr-only / aria).

## Testing (TDD)

Following the existing `tests/components/kb/*` (+ `tests/lib/kb/*`) setup
(vitest + Testing Library):

- **`lib/kb/peek-extract.ts`** (pure): doc excerpt, section excerpt to next
  heading, last-section to EOF, unmatched slug → doc fallback, frontmatter
  stripped.
- **Sources strip:** renders rows for `latestAnswer.refs` in index order;
  hidden when `null`/empty; drops refs missing from the manifest; row click
  calls `openFile(path, anchor)`; collapse state persists.
- **`latestAnswer` derivation** (chat / cited-paths): re-cited earlier source
  still appears under the latest message with its global index; indices match
  `citationIndexMap`.
- **Header:** cited pill toggles `lens`; disabled at 0; filter row drops the
  `/`-to-focus shortcut and keeps `Escape`-clear behaviour.
- **Density:** toggle flips `data-density` and persists; default is compact.
- **Glyph:** non-md types render a glyph, md renders none.
- **Trail/dot:** expanded cited branch shows the rail (no row tint except the
  pinpoint node); collapsed cited container still shows the dot.

## Out of scope

- Collapse-all / expand-all controls.
- Peek on touch devices, and peek for `html`/`pdf`.
- A persistent all-conversation sources view (the lens already serves that).
- User pins/notes, virtualization (unchanged from the living-outline spec).
- Any change to citation parsing, the tree model, or the `/kb` + `/kb/file`
  API contracts.
