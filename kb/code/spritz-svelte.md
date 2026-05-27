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

## What

Each user has a roster of spaces; a space holds boards; a board holds cards arranged in lists, with drag-and-drop (`svelte-dnd-action`, `sortablejs`) and rich-text descriptions. Cards open into a full editor where multiple users can type at once, see each other's cursors, and not stomp on each other's edits. Invite teammates by email, accept via a tokenised link, upgrade to Premium from the dashboard when the 1-space free cap bites.

## Tech

Yjs documents are persisted directly to Firestore through `y-fire`, no separate websocket server. Quill 2 hosts the editor, `y-quill` binds it to a Yjs `Text`, `quill-cursors` renders awareness. Firebase Admin (`firebase-admin`) backs the server-side routes; the Stripe stack is split between client (`@stripe/stripe-js`) and server checkout/portal/webhook routes under `src/routes/api/stripe`. Email goes through `@sendgrid/mail` and `resend` with `nodemailer` as fallback. Deployed via `@sveltejs/adapter-vercel`. Vitest + `@testing-library/svelte` for unit tests.

## Status

Started 2025, last commit 2026-02 ("Remove SpotifyPlayer component from SpaceHeader"). ~920 KB of Svelte source, private. The Spotify embed was dropped late in the run; the product surface is the spaces/boards/cards loop with collaborative editing and the paid tier, all wired end-to-end and never launched.
