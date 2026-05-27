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

## What

Le jeu mappe la grammaire à des mécaniques RPG. Les monstres vivent dans des zones (« Zone 1 : Natures basiques ») et portent des vulnérabilités (`{ nature: "nom" }`, `{ nature: "verbe" }`…) — pour attaquer, l'élève tape sur les mots de la phrase affichée et les tague avec la bonne nature ou fonction. Un Nomotaur Novice porteur de `<sujet><GN><determinant>Le</determinant><nom>chat</nom></GN></sujet>` se vainc en taguant correctement « chat » comme `nom`. Le mode Quête suit HP, XP (50 pour un monstre Apprenti), niveau (1–50, croissance `100 * 1.4^(level-1)`), coups critiques, victoires parfaites et outils de grammaire consommables (Amplificateur de Noms, Vision Verbale, Grammaire Parfaite) ; l'Arène est un mode invincible pour s'entraîner librement.

## Tech

SyMark v1.1 est la spec de balisage au cœur du moteur — douze balises de nature (`nom`, `verbe`, `adjectif`, `adverbe`, `determinant`, `pronom`, `preposition`, `conjCoord`, `conjSub`, `interjection`, `numeral`, `ponctuation`), six balises de fonction (`sujet`, `COD`, `COI`, `attribut`, `CC`, `complNom`), cinq balises de groupe (`GN`, `GV`, `GPrep`, `GAdj`, `GAdv`), avec attributs optionnels (`genre`, `nombre`, `mode`, `temps`, `personne`…), tous alignés sur le vocabulaire BOEN pour que les étiquettes en jeu collent à ce que l'élève voit en classe. Les définitions de monstres dans `src/lib/data/monsters.ts` portent un champ `symarkContent` que le parser runtime transforme en objets `Word` rendus par l'UI de combat. L'état vit dans un store Svelte 5 `playerData` (`src/lib/stores/player-store.ts`) persisté en `localStorage`, avec stores dérivés pour l'accuracy, le win rate, le taux de victoire parfaite et le niveau de maîtrise par nature (0–5). Routes minimales : `/quest`, `/arena`, plus `/demo` et `/demo-consolidated` pour les captures marketing ; pas d'auth, pas de serveur, pas d'endpoint SvelteKit — entièrement client-side.

## Status

Projet personnel, dernière activité en mai 2025. Cible : élèves de 8–13 ans en cycle 3 et collège ; utilisable seul à la maison ou comme démo enseignant au vidéoprojecteur, puisque l'état de partie vit dans le `localStorage` du navigateur. Un seul joueur, pas de leaderboard, pas de système de compte. L'adoption en classe n'a pas été poussée.
