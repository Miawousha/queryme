---
name: "bisque"
url: https://github.com/Miawousha/bisque
role: author
visibility: public
description: "Landing-page bac à sable sur Next.js 16 / React 19 / Tailwind 4 — un seul bouton qui ne fait rien."
year: 2026
last_active: "2026-02"
language: "TypeScript"
stars: 0
code_bytes: 16391
archived: false
tags: [nextjs, react, typescript, ui-only, sandbox]
---

Bisque est une landing teaser d'une seule page sur Next.js 16 et React 19. Toute l'appli tient sur une page : un bouton « this button does nothing » qui incrémente un compteur de clics et révèle une suite de messages sur le thème du homard (« told you. », « 🦞 », « nothing, but with intention. »), un toggle clair/sombre via next-themes et une lueur orangée. Construit avec les primitives shadcn/ui sur Tailwind 4, en placeholder pour `bisque.life` ; « v0.0.1 — the primordial soup ».

## What
Un seul fichier (`src/app/page.tsx`). Titre « bisque.life », une accroche
(« something useful and delicious is brewing. swarms of lobster agents are
assembling. »), le bouton, la ligne de whisper, un compteur de clics qui
apparaît à partir de 3 clics, et un blurb de teasing qui se révèle à 5 clics.
Toggle de thème en haut à droite, emoji homard, blurs orangés en arrière-plan.

## Tech
Next.js 16, React 19.2, Tailwind 4, `next-themes`, un `Button` shadcn. Pas de
backend, pas d'analytics, pas d'état au-delà de `useState`.

## Status
Placeholder v0.0.1 pour `bisque.life`. Construit en février 2026. Pas déployé
publiquement.
