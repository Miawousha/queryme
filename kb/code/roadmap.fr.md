---
name: "roadmap"
url: https://github.com/ION-Altergo/roadmap
role: contributor
visibility: private
description: "Espace de roadmap interne — DSL de tâches en markdown et viewer Svelte Gantt/équipe."
year: 2026
last_active: "2026-01"
language: "Svelte"
code_bytes: 68864
archived: false
tags: [svelte, productivity, docs]
---

roadmap est l'espace interne de planification produit d'ION-Altergo, principalement du markdown (`Adani/overview.md`, `Adani/tasks.md`, snapshots archivés, docs de référence SBOM/certification) animé par un petit viewer Svelte 4 + Vite dans `Adani/viewer/`. Le viewer parse une DSL de tâches maison (`++X` effort, `~X` lead time, `@W` ancrage semaine, suffixe owner) en diagramme de Gantt et en vue d'allocation par membre d'équipe ; il charge `tasks.md` au runtime ou accepte un upload de fichier. Outil fonctionnel côté navigateur, sans backend ; ce n'est pas une app SvelteKit.

## What
Le contenu utile du repo est le markdown — l'overview de l'engagement Adani BESS, la liste vivante `tasks.md`, les rapports d'allocation d'équipe hebdomadaires, les snapshots d'archive datés, et le matériel de référence (overview plateforme Altergo, SBOM, matrice de certification) sous `reference/`. Les tâches suivent un jeu de règles strict : tâches dans une section séquentielles haut-en-bas, sections sœurs en parallèle, même owner dans la même section ne peut pas chevaucher, sections imbriquées héritent de la semaine de départ du parent sauf override, `*m` marque les milestones de matrice de certification. Le viewer Svelte en fait un Gantt + dashboard de capacité pour les syncs hebdo.

## Tech
Svelte 4 + TypeScript + Vite, pas de SvelteKit, pas de backend — `index.html` + `src/main.ts` montent `App.svelte`. Le parser DSL vit dans `src/lib/`, produit des tâches avec semaines start/end calculées qui respectent les règles d'héritage et d'ordre, et alimente deux vues : un timeline Gantt et un graphique d'allocation par owner. Charge `tasks.md` via `fetch` en dev/preview ou via upload de fichier en fallback. Pur côté client ; se déploie en fichiers statiques au besoin.

## Status
Actif en 2026-01 pour l'engagement BESS ADANI sur 24 mois — pilote les syncs hebdo et le suivi de certification. Rôle contributeur — Alexandre a construit le viewer et le parser DSL, écrit la liste de tâches, possède la majeure partie du markdown de planification. Outil mono-utilisateur aujourd'hui ; partageable en équipe dans le navigateur sans infra.
