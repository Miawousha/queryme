---
name: "travelbook"
url: https://github.com/ION-Altergo/travelbook
role: contributor
visibility: public
description: "Prototype de planificateur de déplacements ingénieurs — Next.js 16, NextAuth Google, shadcn/ui, données en mémoire."
year: 2025
last_active: "2025-12"
language: "TypeScript"
stars: 0
code_bytes: 198654
archived: false
tags: [nextjs, react, typescript, productivity, b2b-saas]
---

travelbook est un prototype d'outil interne pour planifier les déplacements ingénieurs sur site chez ION-Altergo — ingénieurs, missions, dépenses, disponibilités et rapports clients sur des timelines jour / semaine / mois / trimestre / année. Construit avec Next.js 16, React 19, NextAuth v5 (provider Google uniquement, verrouillant toutes les routes hors login via le callback `authorized`), Tailwind 4 et shadcn/ui sur une surface inspirée de Linear. Pas de backend pour l'instant : les données vivent dans des tableaux d'exemple `lib/data.ts` exposés via un `data-context.tsx` React, les dépenses sont par défaut en EUR avec le multi-devises seulement modélisé dans le type, et la seule route d'API est celle de NextAuth. Au stade prototype, non déployé ; public sur le GitHub de l'organisation.

## What
Cinq routes principales sous `app/` : un dashboard (`page.tsx`) avec cartes de stats et une timeline agrégée de qui-est-où, `trips/` pour le cycle de vie plan/confirm/in-progress/complete avec une modale `trip-dialog`, `engineers/` pour les jours-sur-site et estimations de revenu par ingénieur, `expenses/` pour les dépenses tagguées par catégorie et liées aux missions, et `reports/` pour produire des rapports mensuels/trimestriels/annuels orientés client. Des sidebars (`availability-sidebar`, `expense-sidebar`, `trip-sidebar`) offrent le drill-in détaillé ; un unique provider `data-context` porte tout l'état en mémoire.

## Tech
Next.js 16 App Router + React 19 + TypeScript ; styling Tailwind 4 avec composants shadcn/ui dans `components/ui/`. Auth via `auth.ts` + `auth.config.ts` : NextAuth v5 avec Google comme seul provider, un callback `authorized` qui renvoie `false` pour toute requête non authentifiée hors `/login` (Edge middleware dans `middleware.ts` qui l'applique), et un callback `session` qui extrait le domaine email pour activer un scope d'équipe par domaine. Pas de base — `lib/data.ts` contient ingénieurs / missions / dépenses / disponibilités en tableaux typés ; `contexts/data-context.tsx` les expose via le Context React. Le type Expense porte un `amount` plus un enum `currency` (EUR/USD/INR/GBP) mais l'UI met tout par défaut en EUR. Seule route d'API : `app/api/auth/[...nextauth]`. Le dépôt porte une pile épaisse de notes `UPDATES_V*.md` documentant les ajouts itératifs (auth, membres d'équipe, fixes de style, disponibilités, cohérence CRUD).

## Status
Prototype, dernière activité décembre 2025, non déployé. Posé sur le GitHub public ION-Altergo comme exploration UI/UX de ce à quoi l'outil de planification pourrait ressembler — le modèle de données et les écrans sont réels, la couche de persistance est l'étape suivante évidente. Pas d'utilisateurs actifs ; supplanté conceptuellement par d'autres outils internes.
