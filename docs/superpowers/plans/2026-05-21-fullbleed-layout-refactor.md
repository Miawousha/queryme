# Full-Bleed Layout Refactor — Brief

> **Status:** Problem brief for a fresh session. NOT yet an executable task plan.
> Pick this up with `superpowers:brainstorming` to resolve the open questions,
> then `superpowers:writing-plans` to produce the task-by-task plan.

## The problem

The KB artifact panel (shipped in `2026-05-21-kb-artifact-panel.md`) was bolted
into the **existing centered-column page layout** instead of getting a real
app-shell layout. The result: the side panel is squeezed into the right half of
a narrow centered column rather than being a true edge-to-edge landscape pane.

### Why it looks wrong — the precise cause

`app/page.tsx` wraps the whole page in one centered, width-capped column:

```tsx
<main className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-5 py-10 sm:px-8 sm:py-14">
  <header>…</header>
  <KbLayout chat={<Chat/>} panel={<KbPanel/>} />
  <footer>…</footer>
</main>
```

So the two-pane split inside `KbLayout` happens **within** a `max-w-6xl`
(~1152px) centered block. Consequences on a normal desktop screen:

1. **The panel never reaches the screen edge.** It stops at the `max-w-6xl`
   boundary, with dead margin between it and the viewport's right edge. It reads
   as "a column with a sidebar crammed in", not "an app".
2. **No landscape feel.** `Chat` is a fixed-height card —
   `components/chat.tsx`: `className="… h-[68vh] min-h-[480px] … rounded-[20px] border …"`.
   The chat is a floating rounded card, and the panel sits beside it inside the
   same column. The page is a smallish centered widget, not a workspace.
3. **The header and footer share the column**, so even if the panes widened,
   they'd still be visually tied to the centered-column metaphor.

The `KbLayout` component itself (`components/kb/kb-layout.tsx`) does the
chat/panel split, resize divider, collapse rail, and mobile drawer correctly —
but it is rendered *inside* the constraining column, so none of that can breathe.

## The target

A real two-pane **app shell** that uses the full viewport.

- **Desktop:** chat pane + KB panel pane fill the viewport edge-to-edge and
  full-height. The KB panel is anchored to the **right edge of the screen** —
  no outer margin. Landscape workspace, not a centered card.
- **Mobile:** the KB panel comes **on top of** the chat (a full-screen overlay /
  sheet over the chat), rather than a narrow side drawer.

## What structurally stands in the way

| Thing | Current | Needs to become |
|---|---|---|
| `<main>` wrapper | `mx-auto max-w-6xl` centered column with padding | full-viewport flex container, no max-width, no `mx-auto` |
| `Chat` shell | fixed `h-[68vh]` rounded bordered card | a pane that fills its column's height; flush or lightly-bordered |
| `<header>` | inside the column, full row | likely a slim full-width top bar (app chrome) |
| `<footer>` | column footer (transparency note + repo links) | needs a new home — top-bar menu, a panel section, or dropped on desktop |
| `KbLayout` | rendered inside the column | becomes (or feeds) the app-shell layout itself |
| `GridBackground` | fixed behind everything | fine as-is, still works full-bleed |

## Open questions to resolve (brainstorm these first)

1. **Header** — slim full-width top bar? What stays in it (logo, name, MCP,
   language, theme toggle, panel toggle)?
2. **Footer** — the "everything is in the public repo" transparency note + the
   system-prompt / KB / repo links. Where do these go in an app shell? (Top-bar
   overflow menu? A footer strip inside the chat pane? The KB panel?)
3. **Chat pane styling** — keep the card aesthetic (border/radius/glass) as a
   pane, or go flush to the chrome? The `fade-up` intro animation and the
   accent glow currently depend on the card.
4. **Desktop panel behavior** — does the panel *push* the chat (resizable
   split, as today) or *overlay* it from the right edge? "Full landscape view"
   reads like a push/split that fills the screen — confirm.
5. **Panel default state** — open or collapsed on first desktop load? The
   resize-width persistence (`localStorage queryme:kbPanelWidth`) and collapse
   rail already exist — keep them.
6. **Mobile** — full-screen overlay vs. bottom sheet for the panel-over-chat.
7. **Does a "chat only, no panel" centered reading still matter?** Probably not,
   but decide explicitly.

## Suggested direction (not binding — for the brainstorm)

Make `app/page.tsx` a true app shell: a full-height flex column — slim top bar,
then a `flex-1 min-h-0` row that *is* the chat | panel split, edge to edge, no
`max-w`. `KbLayout` becomes the shell's body. The chat pane keeps an internal
`max-w` on its message list for readability, but the *pane* fills its half.
Footer links fold into the top bar.

## Files in scope

- `app/page.tsx` — the wrapper refactor (the core change)
- `components/kb/kb-layout.tsx` — likely absorbs/becomes the shell layout
- `components/chat.tsx` — drop the fixed `h-[68vh]` card; become a filling pane
- `components/kb/kb-panel.tsx` — minor: fills its pane
- possibly a new `components/app-shell.tsx` / top-bar component
- `app/globals.css` — if the `fade-up` / card styles change

## Next steps for the fresh session

1. `superpowers:brainstorming` — resolve the open questions above, agree the
   shell structure, header/footer fate, and desktop split-vs-overlay.
2. `superpowers:writing-plans` — produce the task-by-task implementation plan.
3. Execute subagent-driven. Verify visually (the preview tool) at desktop and
   mobile widths — this is a layout change, screenshots are the real test.

## Reference

- The matrice-website (`https://github.com/Miawousha/matrice-website`, private)
  and `learn_anything`'s `ViewerPanel` were the inspiration for the panel; the
  app-shell framing is the missing piece.
