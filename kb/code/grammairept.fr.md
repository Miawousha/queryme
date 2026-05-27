---
name: "GrammairePT"
role: author
visibility: private
description: "RPG de grammaire SvelteKit où les 8–13 ans combattent des monstres en taguant nature et fonction des mots."
year: 2025
last_active: "2025-05"
language: "Svelte"
code_bytes: 640091
archived: false
tags: [education, svelte, typescript]
---

GrammairePT est un RPG SvelteKit en pixel art qui enseigne la grammaire française aux 8–13 ans en transformant l'analyse de phrase en combat. L'écran d'accueil propose un mode Quête — affronter des monstres grammaticaux dont les vulnérabilités sont des natures et fonctions, avec XP et store joueur — et un mode Arène où l'élève est invincible et peut s'entraîner contre n'importe quel monstre. Bâti sur Svelte 5, Vite et un balisage XML maison SyMark qui encode natures (`<nom>`, `<verbe>`…), fonctions syntaxiques (`<sujet>`, `<COD>`…) et groupes (`<GN>`, `<GV>`) alignés sur le BOEN ; le parser transforme les sources SyMark en objets `Word` consommés par les composants de combat et la palette.
