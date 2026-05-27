---
name: "matrice-website"
role: author
visibility: private
description: "Site vitrine Matrice plus app privée sur invitation — Next.js 16 + Supabase, couvert en Playwright et Vitest."
year: 2026
last_active: "2026-05"
language: "TypeScript"
code_bytes: 110630
archived: false
tags: [nextjs, react, typescript]
---

matrice-website est le site public de Matrice doublé d'une couche privée sur invitation. La surface marketing est une landing thématisable en un seul fichier sur Next.js 16, React 19, Tailwind 4 et Base UI ; derrière elle, une zone `/app` protégée par Supabase auth avec un flux d'invitation durci — tables `profiles` et `invites` sous RLS strict, fonction SECURITY DEFINER `consume_invite`, dashboard admin pour émettre et révoquer les tokens, et une API interne de nettoyage d'orphelins. Couvert par Playwright e2e (signup par invitation) et tests unitaires Vitest ; dépôt interne à l'entreprise.
