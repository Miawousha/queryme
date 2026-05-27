---
name: "string-theory"
role: author
visibility: private
description: "Plateforme guitare en quêtes : critères « done when » explicites, XP et tablatures interactives."
year: 2026
last_active: "2026-02"
language: "JavaScript"
code_bytes: 3527238
archived: false
tags: [education, nextjs, react]
---

string-theory est une plateforme d'apprentissage de la guitare en quêtes, construite sur Next.js 16, Prisma + Neon Postgres et NextAuth v5 (credentials avec l'adapter Prisma). Le schéma Prisma modélise une hiérarchie `Quest → Session → Exercise` où chaque quête tague un des six domaines (TIME, TECHNIQUE, FRETBOARD, HARMONY, EAR, IMPROV) et porte une récompense d'XP plus des prérequis en CSV ; chaque exercice porte son `doneCriteria`, une durée, un clip YouTube optionnel et des configs JSON pour un widget de manche maison, un visualiseur de notation alphaTab et des exercices de détection de hauteur via `pitchy`. Front shadcn/ui + Tailwind 4, Playwright en place pour les tests end-to-end.
