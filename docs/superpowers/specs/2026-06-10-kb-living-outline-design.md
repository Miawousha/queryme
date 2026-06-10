# KB browser "Living outline" — design

**Date:** 2026-06-10
**Status:** approved (brainstorm with Alexandre, 2026-06-10)

## Problem

The chat-page KB panel renders a flat, collection-grouped file list
(`components/kb/kb-file-list.tsx`). The content repo rework
(`content.config.yaml`, recursive manifest walk) now supports nested
directories and arbitrary custom collections, but the panel flattens
everything to one level. Citations already carry section anchors
(`[^kb:<path>#<anchor>]` — the persona system prompt mandates them and the
context assembler exposes real headings), yet the panel and viewer discard
the anchor: references resolve only to whole files, and the "Referenced"
section duplicates rows above the groups.

## Goal

A hierarchical treeview that scales to nested KBs of low hundreds of files,
where conversation references are first-class at **section granularity**:
the tree is a live map of what the assistant has cited.

## Decisions (from brainstorm)

- **Model C — "Living outline":** one unified tree of collections → folders
  → documents → section headings. Docs open full-panel (swap + breadcrumb),
  same layout on mobile. Rejected: persistent split rail (too cramped at the
  default 38% panel width), plain explorer swap (references stay file-level).
- **Scale target:** nested folders 2–3 deep, low hundreds of files. No
  virtualization in v1.
- **References:** anchor-level deep refs only. No conversation trail view,
  no user pins/notes (explicitly out of scope for v1).

## UX specification

### Tree

Node kinds:

| Kind | Source | Notes |
|---|---|---|
| collection | `kbGroups(config)` order + labels; `other` catch-all last | i18n label (en/fr) |
| folder | path segments below the collection dir | |
| doc | `KbFile` manifest entry | title, type chip, meta subtitle as today |
| section | extracted h2/h3 headings of markdown docs | hidden until the doc node is expanded |

- Pinned virtual entries (CV) stay above the tree, as today.
- Docs without headings get no chevron.
- Default state: collections expanded, docs collapsed. Expansion state and
  list scroll position persist in `sessionStorage` under
  `queritae:kbTree:<username>`; back from the viewer restores both.
- Counts: collections and folders show child doc counts.

### Reference layer

- A citation `[^kb:path#anchor]` puts chip `[n]` on the matching section
  node; `n` is the same first-appearance index the chat superscripts show.
- Anchor missing or unmatched → chip attaches to the doc node instead.
- **Nothing cited is ever invisible:** collapsed ancestors of any chip show
  a small accent dot.
- **Auto-reveal:** when a new citation arrives, expand the path to its node
  once and pulse the chip. If the user later collapses that branch, never
  auto-reopen it (tracked in a "user collapsed" map for the session).
- **Lens:** a "Referenced · n" toggle next to the filter prunes the same
  tree to cited branches only — same hierarchy and positions, no duplicate
  rows. This **replaces** today's pinned "Referenced" section.

### Filter & keyboard

- Filter input matches doc titles, section titles, and meta (company, role,
  tags). Prunes the tree in place, auto-expands matches, highlights the
  matched substring. Esc clears. Composes with the lens (AND).
- Zero matches → empty state with a clear-filter action.
- Keyboard: `↑`/`↓` move selection, `←`/`→` collapse/expand, `Enter` opens,
  `/` focuses the filter.

### Viewer

- Header becomes a breadcrumb: collection / folder… / doc title, plus the
  existing toolbar actions (copy, download, print, info, GitHub, expand).
  Back returns to the tree with state intact.
- Breadcrumb title carries a chevron opening an **outline dropdown** of the
  doc's sections (with chips) for intra-doc jumps. Fed by manifest
  `sections` — no extra fetch.
- Opening from a citation (chat superscript or tree section node) scrolls
  to the heading and flashes a highlight; cited sections keep a persistent
  subtle marker (left accent border + `[n]` chip by the heading).
- Chat-side rendering is unchanged (superscript `[n]` buttons), but the
  `kb://` link and `onOpenArtifact` now carry the anchor through.
- Mobile keeps the existing drawer; same tree and viewer inside.

## Technical specification

### Data model & API

- `KbFile` gains `sections?: { slug: string; title: string; level: 2 | 3 }[]`
  (markdown files only; YAML/HTML/PDF get none).
- Extraction happens in the manifest walk (`lib/kb/manifest.ts`), which
  already reads file contents for frontmatter — one extra heading scan, no
  new I/O. Headings inside fenced code blocks are ignored.
- The manifest endpoint (`GET /api/a/[username]/kb`) gains a `lang` query
  param. Sections are extracted from the locale-resolved variant (same
  resolution as the file endpoint) so tree labels and slugs always match
  what the viewer renders. The manifest LRU (`lib/kb/cache.ts`) keys on
  `(accountId, lang)`.

### Slug parity & anchor matching

- New `lib/kb/slug.ts`: GitHub-style kebab slugger, used by manifest
  extraction (server) and viewer heading ids (client).
- The model invents its own kebab slugs, so anchor lookup compares
  **normalized** forms (lowercase, non-alphanumerics → hyphen, collapse
  runs, trim) rather than exact strings. Still-unmatched anchors degrade to
  the doc node; never an error.

### Citations

- `lib/kb/cited-paths.ts` evolves to
  `extractCitations(messages): CitedRef[]` with
  `CitedRef = { path, anchor: string | null, index, messageId }`, deduped
  by `(path, anchor)`, ordered by first appearance. The existing
  `extractCitedPaths` behavior (file-level dedup order) is derivable from it
  for the chat superscript numbering, which must stay consistent.
- `KbContext` exposes `citedRefs` instead of `citedPaths`, and
  `openFile(path, anchor?)` instead of `openFile(path)`.

### Tree building

- New `lib/kb/tree.ts`:
  `buildKbTree({ files, groups, citedRefs, filter, lens }): KbTreeNode[]` —
  pure. Produces nodes
  `{ id, kind, label, path?, anchor?, typeBadge?, chips, dot, count, children }`,
  maps chips, computes ancestor dots, applies filter + lens pruning.
- Memoized in the component on its inputs.

### Components & state

- `KbTree` + `KbTreeRow` (new) replace `KbFileList`, which is deleted along
  with the duplicated Referenced section.
- `useKbTreeState` hook owns: expansion set (sessionStorage persistence),
  filter text, lens toggle, auto-reveal effect on `citedRefs` changes, and
  the user-collapsed map.
- `KbViewer` changes: heading ids via shared slugger, scroll-to-anchor with
  flash, persistent cited-section markers, breadcrumb header, outline
  dropdown. Existing markdown/yaml/html/pdf/cv rendering paths unchanged.

### Edge cases

- Citation path not in manifest → ignored (today's behavior).
- Doc with no headings → no chevron; opens at top.
- Anchor unmatched → doc-level chip; viewer opens at top.
- Manifest fetch failure → existing panel error/empty behavior.

### Out of scope (v1)

- Virtualized rendering, YAML key outlining, user pins/annotations,
  conversation-trail view, chip → scroll-chat-to-citing-message
  (bidirectional navigation) — candidates for a follow-up.

## Testing

Vitest, mirroring `tests/lib/kb/`:

- `slug.test.ts` — slugger + normalized matching.
- heading extraction — reuse content fixtures (incl. the full-preset byte
  fixture); fenced-code headings ignored; locale variant resolution.
- `tree.test.ts` — grouping/config order, nesting, `other` catch-all, chip
  mapping (anchor match, normalized match, doc-level fallback), ancestor
  dots, filter pruning, lens pruning, filter+lens composition.
- `citations` — extend `cited-paths.test.ts` for `extractCitations`
  (anchors, dedup by path+anchor, index stability with superscripts).
- Manifest endpoint — `lang` param and `(accountId, lang)` cache keying.
- Component behavior (auto-reveal, persistence, keyboard) is verified via
  the preview workflow, matching current repo practice.
