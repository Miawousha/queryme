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
