---
name: "exit_velocity"
role: author
visibility: private
description: "Tunnel d'admission pseudonyme pour fondateurs explorant discrètement leurs options de sortie."
year: 2026
last_active: "2026-01"
language: "TypeScript"
code_bytes: 121412
archived: false
tags: [nextjs, react, typescript, fintech]
---

exit_velocity est un tunnel d'admission Next.js 15 qui permet aux fondateurs d'évaluer une sortie en toute confidentialité. Le parcours est strict : on saisit un email, on se voit attribuer un pseudonyme céleste (ex. « Crimson Vega ») dont l'unicité globale est garantie par une réservation en Postgres, on clique sur le lien de vérification dans les 48 heures, puis on répond à six questions dans une session chronométrée de 15 minutes — pas de brouillon, pas de re-soumission. Construit avec shadcn/ui, Vercel Postgres, Resend pour la vérification et les notifications admin, et Zustand pour le timer ; chaque soumission vérifiée déclenche une relecture manuelle par le propriétaire.

## What

Les six questions sont délibérées : product-market fit (oui/peut-être/pas encore), tranche de revenu (0–1 M$ / 1–10 M$ / 10 M$+), volonté d'envisager une transaction ce trimestre, rôle (fondateur/employé/investisseur/advisor/autre), snapshot de l'entreprise (≥50 caractères) et réflexion stratégique (≥50 caractères). La home vend la proposition (« Évaluez en privé vos options de sortie — confidentiel by design, sans tracking, sans cookies ») ; `/insights` publie trois articles MDX (signaux de maturité, l'exit discret, penser la valorisation) pour le SEO et la confiance. Après vérification, le formulaire s'affiche sous un badge fixe qui décompte les 15 minutes ; à zéro, un encart remplace le formulaire : « la fenêtre est terminée — rien n'a été sauvegardé ».

## Tech

Les pseudonymes proviennent d'un pool curé — environ 110 modificateurs sobres (Ash, Slate, Onyx, Sepia…) croisés avec environ 130 noms célestes (Vega, Orion, Lyra, Nebula…), pondérés 80 % communs / 20 % rares, tirés via `crypto.randomInt` et filtrés contre les tokens grandiloquents (Alpha, Ultra, Divine). L'unicité est imposée par une insertion dans la table `pseudonyms` avec contrainte unique et retry jusqu'à 50 fois sur `23505` ; le générateur log un warning au-delà de 80 % de capacité. Les tokens de vérification (nanoid) vivent sur la ligne session ; Resend envoie à la fois le lien magique utilisateur et une notification admin templatée avec `replyTo` réglé sur le vrai email du fondateur, pour que l'opérateur réponde sans quitter sa boîte. La validation est Zod + react-hook-form ; le timer Zustand tique via un `setInterval` et le bouton se désactive à zéro.

## Status

En production sur exitvelocity.me, déployé sur Vercel. Opéré en solo par le propriétaire ; chaque soumission est relue à la main et traitée depuis la boîte admin — pas de file de triage, pas de scoring, pas de CRM. Dernière activité significative en janvier 2026. La contrainte est intentionnelle : le produit ne peut pas passer à l'échelle au-delà d'un opérateur sans changer de nature.
