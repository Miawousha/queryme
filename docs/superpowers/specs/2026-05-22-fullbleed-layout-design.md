# Full-Bleed Layout Refactor — Design

> **Status:** Approved design. Source brief:
> `docs/superpowers/plans/2026-05-21-fullbleed-layout-refactor.md`.
> Next step: `superpowers:writing-plans`.

## Problem

The KB artifact panel was bolted into the existing centered `max-w-6xl` page
column. The two-pane split inside `KbLayout` therefore happens *within* a
~1152px centered block: the KB panel never reaches the screen edge, the chat is
a fixed-height floating card, and header/footer are tied to the centered-column
metaphor. The result reads as "a column with a sidebar crammed in", not an app.

## Target

A true full-bleed two-pane **app shell** that uses the full viewport: a slim
top bar over an edge-to-edge chat | KB split, the KB pane anchored to the
right edge of the screen.

## Resolved decisions

1. **Desktop panel behavior** — push / split. Chat and KB share the viewport as
   a resizable two-pane split; the existing divider drag, width persistence, and
   collapse rail are kept. Both panes always visible.
2. **Top bar** — slim, full-width, bottom-bordered app chrome. Left: logo +
   "Alexandre Collet / Queryable CV". Right: theme toggle · MCP button ·
   language toggle · **ⓘ About** (new) · **KB toggle** (new).
3. **Footer** — removed. Its transparency note + system-prompt / KB / repo links
   move into an **About popover** opened by the ⓘ top-bar button, modeled on the
   existing `McpModal`.
4. **Chat pane styling** — flush. Drop the rounded card (`border`,
   `rounded-[20px]`, glass background) and the fixed `h-[68vh] min-h-[480px]`.
   The chat becomes a `flex h-full` pane divided from the KB pane by a border
   only. Status header and input row stay as internal sections. `fade-up` moves
   onto the message list. The accent glow is kept but becomes a subtle top-edge
   wash. The message list keeps an internal `max-w` for readability; the pane
   itself fills its half.
5. **Panel default state** — open on first desktop load. Width persistence
   (`localStorage queryme:kbPanelWidth`) and the collapse rail are kept.
6. **Mobile** — the KB panel opens as a **full-screen overlay** over the chat
   (full height + width, its own close button), replacing the narrow side
   drawer.
7. **Chat-only centered reading mode** — dropped. The chat pane fills its
   column; readability comes from an internal `max-w` on the message list.

## Architecture

`app/page.tsx` becomes a full-height flex column with **no `max-w`, no
`mx-auto`**:

```
<KbProvider>
  <GridBackground />              fixed, behind everything — unchanged
  <div class="flex h-screen flex-col">
    <AppTopBar … />               slim chrome, border-b
    <KbLayout chat={…} panel={…}/> flex-1 min-h-0 — the two-pane body
  </div>
  <McpModal … />
  <AboutPopover … />
</KbProvider>
```

### Components

- **`AppTopBar`** (new, `components/app-top-bar.tsx`) — slim full-width bar.
  Renders logo + name and the right-side controls (`ThemeToggle`, MCP button,
  `LanguageToggle`, About button, KB-toggle button). Receives the strings, the
  `onOpenMcp` / `onOpenAbout` callbacks, the language value/setter, and the KB
  collapsed state + toggle.
- **`AboutPopover`** (new, `components/about-popover.tsx`) — modeled on
  `McpModal`'s open/onClose contract. Contains the transparency note and the
  three repo links (currently `FooterLink`s in `app/page.tsx`).
- **`KbLayout`** (`components/kb/kb-layout.tsx`) — stays the two-pane body but
  becomes flush and full-bleed: no rounded card wrapper / no padding gap around
  panes; the KB pane sits flush to the right viewport edge; panes divided by
  borders. Desktop panel starts **open**. The collapse state must be drivable
  from the top bar's KB-toggle button — lift `collapsed` (and a toggle) to
  `app/page.tsx` and pass into both `KbLayout` and `AppTopBar`, so there is a
  single source of truth. The resize divider, width persistence, collapse rail,
  and single-`chat`-instance invariant are preserved. The mobile slide-over
  drawer becomes a full-screen overlay.
- **`Chat`** (`components/chat.tsx`) — drop `h-[68vh] min-h-[480px]`, the
  `rounded-[20px] border`, and the glass card background. Becomes
  `flex h-full flex-col` filling its pane. Keep the status header, scroll
  region, and input row as internal flush sections. `fade-up` moves to the
  message list container; the accent glow becomes a top-edge wash.
- **`KbPanel`** (`components/kb/kb-panel.tsx`) — minor: ensure it fills its pane
  (`h-full`) now that the wrapper card is gone.
- **`GridBackground`** — unchanged; already full-bleed and `fixed`.

### State flow

`app/page.tsx` owns: `lang`, `mcpOpen`, `aboutOpen` (new), and `kbCollapsed`
(new — lifted from `KbLayout`). `AppTopBar`'s KB toggle and `KbLayout`'s
collapse rail both read/write `kbCollapsed`. Width and mobile-drawer state stay
local to `KbLayout`.

## Out of scope

KB panel content/behavior (file list, viewer, citation wiring), chat
functionality, theming primitives, and `GridBackground` internals are
unchanged. This is a pure layout/UX refactor.

## Verification

Visual, via the preview tool. Acceptance is screenshot-based at:

- Desktop ~1440px — full-bleed two-pane shell, KB flush to the right edge,
  panes filling viewport height, no centered-column margin.
- Mobile ~390px — single chat column, KB toggle opens a full-screen overlay.
- Both light and dark themes.
- Resize divider, collapse rail, KB top-bar toggle, and About popover all work.
