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

## What

Le flux public est `/` (landing thématisable un-fichier avec étiquettes JetBrains-Mono, animations reveal, fond grille) → `/register?invite=<token>` ou `/login`. Un token est requis pour s'inscrire ; sans lui l'utilisateur arrive sur `/invite-required`. Une fois la création Supabase faite, le flux serveur appelle `consume_invite(token, user_id, email)` et seulement ensuite crée la ligne `profiles`. Dans `/app`, l'admin voit `/app/admin` avec deux server actions — `new-invite-form.tsx` (créer une invitation avec email pin optionnel) et `revoke-button.tsx` (marquer révoqué) — plus la table des tokens en attente.

## Tech

Deux migrations portent toute la couche privée. `20260526120000_init_profiles_invites.sql` crée `profiles` (id ← `auth.users`, rôle `member|admin`, index partiel `where role = 'admin'`, trigger `updated_at`, helper `is_admin()` SECURITY DEFINER pour éviter la récursion RLS) et `invites` (token unique, email pin optionnel, `created_by`, `expires_at`, `revoked_at`, `consumed_at`, `consumed_by`). La RLS est stricte : seule `profiles_select_own_or_admin` est exposée au client ; tous les writes passent par le service role. `20260526120100_consume_invite_fn.sql` définit `consume_invite(p_token, p_user_id, p_user_email)` en SECURITY DEFINER, marquant l'invitation consommée de manière atomique uniquement si elle est non révoquée, non consommée, non expirée et (si pinned) si l'email correspond en case-insensitive. `/api/internal/cleanup-orphans` purge les lignes `auth.users` qui n'ont jamais consommé d'invitation. Le e2e Playwright (`tests/e2e/invite-signup.spec.ts`) joue le flux complet token → signup → profil créé contre un Supabase local (`tests/setup-local-supabase.sh`) ; Vitest couvre les unités helpers.

## Status

Dépôt interne Matrice, actif en mai 2026. Opéré par l'entreprise ; le dashboard admin permet à l'équipe d'onboarder les early users un par un. La landing marketing est la face publique ; la couche `/app` est ce avec quoi les early users interagissent réellement après acceptation. Les tests couvrent le chemin d'invitation parce que c'est la boucle chaude du moment.
