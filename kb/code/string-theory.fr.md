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

## What

L'apprenant choisit un domaine, voit les quêtes auxquelles il a droit (les prérequis sont résolus contre son `UserQuestProgress`), et avance dans des sessions ordonnées d'exercices. Chaque exercice énonce un checkpoint `doneCriteria` que l'apprenant valide lui-même, et compléter une session incrémente `UserSessionProgress` ; finir toutes les sessions clôt la quête et crédite l'XP. Un exercice peut embarquer un clip YouTube à un timestamp précis, afficher un bloc de notation alphaTab, allumer des positions sur le widget de manche, ou lancer un drill de chant/détection de hauteur sur le micro.

## Tech

App Router Next.js 16 avec route groups (`src/app/(app)/{dashboard,quests,sessions,learn,gear,profile}`), server actions dans `src/lib/actions.ts`, NextAuth v5 credentials + bcryptjs vérifié à travers l'adapter Prisma sur `@neondatabase/serverless`. Le contenu vit dans `content/learn/` en markdown importé au build. Le composant fretboard est son propre package de workspace (`packages/fretboard-widget`). `alphatab` rend la notation, `pitchy` fait la détection de hauteur par autocorrélation sur `getUserMedia`, le métronome est codé à la main (`components/metronome.tsx`). E2E en Playwright, un `ARCHITECTURE.md` documente les choix.

## Status

Construit début 2026, dernier commit 2026-02 (« fix: update chord markers and improve CAGED system descriptions »). ~3,5 Mo de source, privé, mono-utilisateur. Le contenu sur le système CAGED (la façon systématique de naviguer le manche) était la dernière chose en cours d'ajustement.
