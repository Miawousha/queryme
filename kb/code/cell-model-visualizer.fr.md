---
name: "cell-model-visualizer"
role: author
visibility: private
description: "Outil Vite/React pour inspecter un JSON de modèle de cellule batterie via des onglets OCV, impédance, thermique, vieillissement et sécurité."
year: 2025
last_active: "2025-09"
language: "TypeScript"
code_bytes: 169848
archived: false
tags: [battery, react, typescript, tooling]
---

cell-model-visualizer est une appli interne Vite + React 19 pour explorer un fichier JSON de modèle de cellule batterie. L'utilisateur charge une cellule dans une bibliothèque persistée en localStorage, puis bascule entre les onglets Overview / OCV / Impédance / Thermique / Vieillissement / Sécurité — chacun affiche des vues Plotly sur le même dataset (fabricant, modèle, version, date de mise à jour, courbes de caractérisation). Import drag-and-drop via `FileHandler` ; MUI pour la coque. Outil compagnon des travaux de modélisation cellule chez Altergo ; non public.
