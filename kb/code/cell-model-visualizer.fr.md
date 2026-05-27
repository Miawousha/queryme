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

## What
Sept onglets dans une coque MUI `AppBar` + `Tabs`. **Library** liste les
cellules importées (avec une cellule de démo LiFePO4 32700 par défaut) et
change la cellule active au clic. **Overview** affiche les fiches
caractéristiques physiques / électriques / thermiques depuis le JSON. **OCV
Curves**, **Impédance**, **Thermique**, **Vieillissement** et **Sécurité**
rendent des vues Plotly sur les tableaux de caractérisation du JSON (tables
SOC-OCV, spectres EIS, coefficients thermiques, paramètres du modèle de
vieillissement, enveloppe sécurité). Le header garde version et date de mise
à jour visibles. Le JSON est un schéma imbriqué volumineux avec
`physical_properties`, `electrical_specifications`, plage de tension, ratings
courant, etc. — ce que l'équipe modélisation d'Altergo produit à partir d'un
run de calibration.

## Tech
Vite + React 19 + MUI + Plotly. Pas de backend. L'état tient dans deux clés
`localStorage` — `cellModelVisualizer_importedCells` (la bibliothèque) et
`cellModelVisualizer_currentCell` (le dataset actif) — donc un refresh garde
votre travail, et rien ne quitte la machine. `FileHandler` accepte un JSON en
drag-and-drop et le route via `handleDataImport`, qui déduplique par
fabricant+modèle. Le design de bibliothèque permet aux ingés de comparer des
cellules sans serveur.

## Status
Construit en 2025 en parallèle des travaux de modélisation cellule d'Altergo ;
dernier commit 2025-09. Utilisé en interne pour vérifier les sorties de
calibration et pour montrer à quoi « ressemble » un modèle de cellule à des
stakeholders non-modélisation. Privé ; une cellule de démo livrée plus ce que
l'utilisateur importe.
