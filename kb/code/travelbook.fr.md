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
