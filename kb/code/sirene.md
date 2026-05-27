---
name: "sirene"
url: https://github.com/Miawousha/sirene
role: author
visibility: public
description: "Tauri 2 desktop app for editing Mermaid diagrams with a live SVG preview."
year: 2026
last_active: "2026-02"
language: "TypeScript"
stars: 0
code_bytes: 123094
archived: false
tags: [desktop, react, typescript, tooling]
---

Sirene is a Tauri 2 desktop app for editing Mermaid diagrams with a live preview. The Rust shell ships clipboard, fs, and dialog plugins around a React 19 renderer where CodeMirror 6 sits in an Allotment split-pane next to a Mermaid 11 SVG preview, with a file tree, multiple tabs, and eight starter templates (flowchart, sequence, class, state, ER, gantt, pie, gitGraph). Ctrl+S/O/N/W/C bind to save, open, new tab, close tab, and copy-as-PNG; PNG rendering goes through an off-screen canvas in `src/lib/clipboard.ts`. shadcn/ui + Tailwind 4 for the chrome, dark/light themes wired through a `useTheme` hook.

## What

Single-window editor: pick a template from the toolbar or open an `.mmd` file from the tree, type Mermaid source on the left, the SVG re-renders on the right as you go. Multiple tabs let you flip between diagrams; recent files persist across sessions; the preview pane is zoomable (scroll, Alt-drag, fit-to-view). Ctrl+C on the preview copies a 2x retina PNG straight to the clipboard so it pastes into Word or Google Docs without a save step.

## Tech

The Rust crate at `src-tauri/` is thin — `tauri-plugin-clipboard-manager`, `tauri-plugin-fs`, `tauri-plugin-dialog`, `tauri-plugin-log` and an `image-png` Tauri feature. All UX lives in React: `App.tsx` wires keyboard shortcuts, `hooks/useTabs.ts` owns multi-document state, `hooks/useFileTree.ts` the directory view, `lib/templates.ts` the eight seed diagrams, `lib/preprocessor.ts` auto-quotes labels with special characters, `lib/clipboard.ts` rasterises SVG to PNG via off-screen canvas plus `DOMParser` to inject `xmlns` and explicit width/height. CodeMirror 6 with a custom Mermaid language mode at `lib/mermaid-lang.ts`.

## Status

Started early 2026, last commit 2026-02 ("Auto-close tabs when files are deleted or renamed"). ~3 MB installer, Windows + macOS (Intel + Apple Silicon), version 0.2.0. Personal tool, used to make the diagrams in Alexandre's notes and decks.
