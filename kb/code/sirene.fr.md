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

## What

Éditeur mono-fenêtre : on choisit un modèle dans la toolbar ou on ouvre un fichier `.mmd` depuis l'arbre, on tape le source Mermaid à gauche, le SVG se redessine à droite à chaque frappe. Les onglets multiples permettent de basculer entre diagrammes ; les fichiers récents persistent entre sessions ; l'aperçu est zoomable (molette, Alt-drag, bouton fit-to-view). Ctrl+C sur l'aperçu copie un PNG 2x retina directement dans le presse-papiers — collable dans Word ou Google Docs sans étape d'export.

## Tech

Le crate Rust dans `src-tauri/` est mince — `tauri-plugin-clipboard-manager`, `tauri-plugin-fs`, `tauri-plugin-dialog`, `tauri-plugin-log` et la feature Tauri `image-png`. Toute l'UX vit côté React : `App.tsx` câble les raccourcis clavier, `hooks/useTabs.ts` porte l'état multi-document, `hooks/useFileTree.ts` la vue répertoire, `lib/templates.ts` les huit diagrammes seed, `lib/preprocessor.ts` quote automatiquement les labels à caractères spéciaux, `lib/clipboard.ts` rastérise le SVG en PNG via canvas off-screen plus `DOMParser` pour injecter `xmlns` et width/height explicites. CodeMirror 6 avec un mode Mermaid maison dans `lib/mermaid-lang.ts`.

## Status

Démarré début 2026, dernier commit 2026-02 (« Auto-close tabs when files are deleted or renamed »). Installeur ~3 Mo, Windows + macOS (Intel + Apple Silicon), version 0.2.0. Outil perso, utilisé pour faire les diagrammes des notes et decks d'Alexandre.
