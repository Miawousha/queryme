---
name: "sirene"
url: https://github.com/Miawousha/sirene
role: author
visibility: public
description: "Application desktop Tauri 2 pour éditer des diagrammes Mermaid avec aperçu SVG en direct."
year: 2026
last_active: "2026-02"
language: "TypeScript"
stars: 0
code_bytes: 123094
archived: false
tags: [desktop, react, typescript, tooling]
---

Sirene est une application desktop Tauri 2 pour éditer des diagrammes Mermaid avec un aperçu en direct. La coque Rust embarque les plugins clipboard, fs et dialog autour d'un renderer React 19 où CodeMirror 6 s'installe dans un split-pane Allotment à côté d'un aperçu SVG Mermaid 11, avec arborescence de fichiers, onglets multiples et huit modèles de démarrage (flowchart, sequence, class, state, ER, gantt, pie, gitGraph). Ctrl+S/O/N/W/C correspondent à sauvegarder, ouvrir, nouvel onglet, fermer onglet et copier-en-PNG ; le rendu PNG passe par un canvas off-screen dans `src/lib/clipboard.ts`. shadcn/ui + Tailwind 4 pour l'habillage, thèmes clair/sombre câblés via un hook `useTheme`.
