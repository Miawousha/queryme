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
