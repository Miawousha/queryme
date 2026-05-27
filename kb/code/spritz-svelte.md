---
name: "spritz-svelte"
role: author
visibility: private
description: "SvelteKit task app with Yjs real-time collab, Firebase auth/data, and a Stripe Premium tier."
year: 2025
last_active: "2026-02"
language: "Svelte"
code_bytes: 923430
archived: false
tags: [svelte, typescript, productivity]
---

spritz-svelte is a SvelteKit 2 + Svelte 5 task app organised around spaces and boards, with collaborative rich-text inside cards via Yjs (`y-fire` Firestore provider, `y-quill`, `quill-cursors`). Firebase handles auth and data through dedicated services under `src/lib/services/firebase`; Stripe gates a 3.99 EUR/month Premium plan (free tier is capped at 1 space) with webhook + checkout + portal routes under `src/routes/api/stripe`. SendGrid and Resend send invitation emails, and the app ships on the Vercel adapter. Personal product experiment — real-time collab and the upgrade flow are wired end-to-end, not stubbed.
