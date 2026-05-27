---
name: "spritz-modern"
url: https://github.com/ION-Altergo/spritz-modern
role: contributor
visibility: private
description: "Réécriture React + TS de spritz — Redux Toolkit, Styled Components, React Spring, Vite."
year: 2025
last_active: "2025-04"
language: "TypeScript"
code_bytes: 156521
archived: false
tags: [react, typescript, productivity]
---

spritz-modern est la réécriture React + TypeScript du gestionnaire de tâches Altergo spritz, construite sur Vite avec Redux Toolkit (slices theme et tasks), Styled Components, React Spring, react-dnd et Firebase pour la persistance et la présence. Le périmètre d'origine est repris — éditeur markdown, liste de tâches interactive, collaboration par URL via les hooks `useCollaboration` et `useTaskData`, skinning thémé via un `ThemeProvider` styled-components. Atteint la parité de fonctionnalités avec `spritz` et ajoute un système de skin typé par composants qui rend l'ajout de thèmes trivial. Suite interne ; supplantée plus tard par la version personnelle en SvelteKit.

## What
Même UX à deux panneaux que l'original — éditeur markdown à gauche, liste de tâches interactive à droite avec toggles, badges de priorité, mentions d'assigné et drag-and-drop pour réordonner via react-dnd. Le partage passe toujours par une URL `?taskId=` adossée à Firebase Realtime Database ; ouvrir le lien ailleurs rejoint le même board en live, avec un `CollaborationIndicator` qui affiche les autres utilisateurs actifs. Le changement de thème est exposé dans le header et permute toute la surface (couleurs, polices, animations de drop, icônes) sans recharger.

## Tech
Layout sous `src/` : `components/{Layout,TaskInput,TaskDisplay,Shared}` pour l'UI, `hooks/useTaskData.ts` et `hooks/useCollaboration.ts` enveloppent les lectures/écritures Firebase et la présence, `store/` contient les slices Redux Toolkit (`themeSlice`, tasks), `skins/themes/` livre les thèmes `default`, `darkBlue` et `altergo` plus un contrat `ThemeType` dans `types.ts` que tout nouveau skin implémente (`colors`, `text`, `animations`, `icons`). Styled Components lit le thème actif via `ThemeProvider` ; React Spring pilote les animations physiques de drop et destruction déclarées par thème. Vite + ESLint + TS strict ; Firebase SDK v9 modulaire ; échantillons et notes de migration conservés dans `samples/`.

## Status
Continuation interne du spritz d'origine, dernière activité avril 2025. Atteint la parité de fonctionnalités puis stagne — la version personnelle SvelteKit (`spritz-svelte`) prend le relais comme surface préférée d'Alexandre. Non déployée publiquement ; vit dans le GitHub de l'organisation comme référence React canonique pour l'idée du système de skins.
