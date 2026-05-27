---
name: "spritz"
url: https://github.com/ION-Altergo/spritz
role: contributor
visibility: private
description: "Gestionnaire de tâches Altergo d'origine — tâches markdown, collab Firebase temps réel, animations GSAP."
year: 2025
last_active: "2025-04"
language: "JavaScript"
code_bytes: 132245
archived: false
tags: [productivity]
---

spritz est le gestionnaire de tâches d'équipe Altergo d'origine, une SPA en pur HTML/CSS/JS avec GSAP pour le mouvement et Firebase Realtime Database pour l'état partagé. Un éditeur markdown à gauche se rend en liste de tâches interactive à droite — clic gauche pour basculer, clic droit sur une tâche complétée déclenche une suppression sonorisée, et les tâches inactives se mettent lentement à « couler » via un filtre SVG goo après 24 h. La collab temps réel est réellement câblée : chaque board a une URL `?taskId=`, et `database.ref('taskLists/' + id).on('value', ...)` pousse les modifications à tous ceux qui ont le lien. Hébergé sur Firebase App Hosting ; supplanté en interne par `spritz-modern`.

## What
Les utilisateurs écrivent les tâches en lignes markdown (`[ ] Fix bug @alice p**`) — le suffixe `@owner` désigne l'assigné et `p*` / `p**` / `p***` règle la priorité, rendue en badges colorés. Le panneau d'édition reste la source de vérité ; le panneau de droite est une liste rendue depuis le modèle, cliquable, avec un son sur toggle et une animation de destruction par filtre goo sur le clic droit. Un lien de partage en bas porte le `?taskId=` du board ; ouvrir l'URL dans un autre onglet ou appareil rejoint en live le même nœud Firebase.

## Tech
JS vanilla découpé en modules ciblés : `markdownParser.js` parse les lignes en modèle de tâches, `modelRenderer.js` peint la liste interactive, `animations.js` pilote les timelines GSAP et le filtre SVG goo, `skinManager.js` permute les bundles CSS+JS de skins (default et dark-blue livrés dans `js/skins/`), et `share.js` gère le setup Firebase SDK v8, le `?taskId=` d'URL, les sauvegardes `database.ref('taskLists/' + id).set(...)` et les abonnements `.on('value', ...)`. L'« ooze » des tâches inactives compare les timestamps serveur `lastUpdated` à maintenant et fait monter le filtre goo au-delà des 24 h. Déployé via `apphosting.yaml` sur Firebase App Hosting ; `database.rules.json` laisse la realtime DB ouverte à quiconque détient un task ID.

## Status
Construit et utilisé par l'équipe Altergo jusqu'en 2025, dernière activité avril 2025. Supplanté en interne par `spritz-modern` (la réécriture React) puis par la version personnelle SvelteKit d'Alexandre. Codebase gelée en pur JS ; le projet Firebase (`spritz-31ad5`) et les URLs live résolvent encore.
