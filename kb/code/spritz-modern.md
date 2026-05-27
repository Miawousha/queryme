---
name: "spritz-modern"
url: https://github.com/ION-Altergo/spritz-modern
role: contributor
visibility: private
description: "React + TS rewrite of spritz — Redux Toolkit, Styled Components, React Spring, Vite."
year: 2025
last_active: "2025-04"
language: "TypeScript"
code_bytes: 156521
archived: false
tags: [react, typescript, productivity]
---

spritz-modern is the React + TypeScript rewrite of the Altergo spritz task manager, built on Vite with Redux Toolkit (theme and tasks slices), Styled Components, React Spring, react-dnd, and Firebase for persistence and presence. The original feature set carries over — markdown editor pane, interactive task list, share-by-URL collaboration via `useCollaboration` and `useTaskData` hooks, themed skinning through a styled-components `ThemeProvider`. Reaches feature parity with `spritz` and adds a typed component-based skin system that makes new themes trivial. Internal continuation; later superseded by the personal SvelteKit version.

## What
Same two-pane UX as the original — markdown editor on the left, interactive task list on the right with toggles, priority badges, owner mentions, and drag-and-drop reordering via react-dnd. Sharing still works through a `?taskId=` URL backed by Firebase Realtime Database; opening the link elsewhere joins the same board live, with a `CollaborationIndicator` showing other active users. Theme switching is exposed in the header and swaps the entire surface (colors, fonts, drop animations, icons) without reloading.

## Tech
File layout under `src/`: `components/{Layout,TaskInput,TaskDisplay,Shared}` for UI, `hooks/useTaskData.ts` and `hooks/useCollaboration.ts` wrap Firebase reads/writes and presence, `store/` holds Redux Toolkit slices (`themeSlice`, tasks), `skins/themes/` ships `default`, `darkBlue`, and `altergo` themes plus a `types.ts` `ThemeType` contract that any new skin implements (`colors`, `text`, `animations`, `icons`). Styled Components reads the active theme via `ThemeProvider`; React Spring drives physics-based drop and destruction animations declared per theme. Vite + ESLint + strict TS configs; Firebase v9 modular SDK; samples and migration notes kept alongside `samples/`.

## Status
Internal continuation of the original spritz, last active April 2025. Reached feature parity then stalled — the personal SvelteKit version (`spritz-svelte`) took over as Alexandre's preferred surface. Not deployed publicly; lives in the org GitHub as the canonical React reference for the skin system idea.
