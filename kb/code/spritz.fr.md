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
