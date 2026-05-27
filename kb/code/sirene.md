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
