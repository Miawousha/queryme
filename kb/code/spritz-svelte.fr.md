---
name: "spritz-svelte"
role: author
visibility: private
description: "App SvelteKit de gestion de tâches : collaboration temps réel Yjs, auth/data Firebase, offre Premium Stripe."
year: 2025
last_active: "2026-02"
language: "Svelte"
code_bytes: 923430
archived: false
tags: [svelte, typescript, productivity]
---

spritz-svelte est une app SvelteKit 2 + Svelte 5 organisée en spaces et boards, avec édition riche collaborative dans les cartes via Yjs (provider Firestore `y-fire`, `y-quill`, `quill-cursors`). Firebase gère l'auth et les données via des services dédiés sous `src/lib/services/firebase` ; Stripe verrouille une offre Premium à 3,99 €/mois (le tier gratuit est plafonné à 1 space) avec les routes webhook + checkout + portal sous `src/routes/api/stripe`. SendGrid et Resend envoient les invitations, et l'app s'expédie via l'adaptateur Vercel. Expérience produit personnelle — la collab temps réel et le parcours d'upgrade sont câblés de bout en bout, pas en stub.

## What

Chaque utilisateur a une liste de spaces ; un space contient des boards ; un board contient des cartes rangées en listes, avec drag-and-drop (`svelte-dnd-action`, `sortablejs`) et descriptions en rich-text. La carte s'ouvre sur un éditeur plein écran où plusieurs utilisateurs peuvent taper simultanément, voir le curseur de l'autre, et ne pas écraser leurs modifications mutuelles. On invite par email, on accepte via lien tokenisé, on passe Premium depuis le dashboard quand le plafond gratuit d'1 space coince.

## Tech

Les documents Yjs sont persistés directement dans Firestore via `y-fire`, sans serveur websocket séparé. Quill 2 héberge l'éditeur, `y-quill` le binde à un `Text` Yjs, `quill-cursors` rend l'awareness. Firebase Admin (`firebase-admin`) porte les routes serveur ; la stack Stripe est répartie entre client (`@stripe/stripe-js`) et routes serveur checkout/portal/webhook sous `src/routes/api/stripe`. Les emails passent par `@sendgrid/mail` et `resend` avec `nodemailer` en fallback. Déploiement via `@sveltejs/adapter-vercel`. Vitest + `@testing-library/svelte` pour les tests unitaires.

## Status

Démarré en 2025, dernier commit 2026-02 (« Remove SpotifyPlayer component from SpaceHeader »). ~920 Ko de source Svelte, privé. L'embed Spotify a été retiré en fin de course ; la surface produit reste la boucle spaces/boards/cartes avec édition collaborative et tier payant, câblée bout en bout mais jamais lancée.
