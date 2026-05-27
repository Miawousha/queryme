---
name: "learn_anything"
url: https://github.com/akhilaryan/learn_anything
role: contributor
visibility: public
description: "OpenWindow — un tuteur IA qui transforme les manuels scolaires en leçons interactives multidisciplinaires."
year: 2026
last_active: "2026-05"
language: "TypeScript"
stars: 0
code_bytes: 15680107
archived: false
tags: [education, ai, nextjs, react, typescript]
---

learn_anything est le dépôt qui livre OpenWindow, un produit de tutorat IA où l'utilisateur photographie des pages de manuel ou choisit un sujet, et l'application génère des leçons interactives assemblées depuis une bibliothèque d'environ 60 « blocks » React — notation musicale, échiquier, courbes mathématiques, piano, cartes interactives, fill-in-blank, drills, etc. Le moteur Lyceum route un sujet vers un pipeline de conversation adossé aux SDK Anthropic et OpenAI, persiste cours et profils dans Supabase, et gère les abonnements premium via Stripe avec un listener webhook local. Propriété d'Akhil Aryan ; j'y contribue via des PR fusionnées dans un large monorepo Next.js 16 / React 19 qui héberge aussi les opérations du venture studio (CRM, scrapers, harnais de simulation).

## What

Une leçon se joue comme un flux de blocks. La bibliothèque couvre `staff-notation` (engraving musical via alphaTab), `chessboard` (avec goboard pour le Go), `math-plot`, `piano-player`, `interactive-keyboard`, `interactive-map` (D3 + Turf pour l'exploration géographique), `fraction-visualizer`, `number-line`, `hundred-chart`, `multiplication-table`, `long-division`, `addition-algorithm`, `place-value-blocks`, `bar-model`, `flashcard`, `match-pairs`, `fill-in-blank`, `quick-quiz`, `math-drill`, `data-table`, `breathing-exercise`, `scenario-explore`, `recipe-step`, `timeline`, `video-embed`, `worked-example`, `guitar-tab`, `strumming-pattern`, `rhythm-tap`, `pitch-sing`, `vocal-range-test`, `sing-along`, `sheet-viewer`, `stock-simulator`, `spreadsheet-formula`, et des dizaines d'autres. Le moteur Lyceum dans `src/lyceum/engine/` orchestre `flow-controller`, `runner`, `pipeline`, `grading`, `tool-registry`, `prompts.ts` ; des prompts markdown (`discover-topics.md`, `extract-questions.md`, `process-textbook.md`, `analyze-transcript.md`, `draft-evaluator.md`, `grading.md`, `fix-jsx.md`) pilotent chaque étape. Les routes incluent `/lyceum`, `/sounding-board`, `/scan` (capture manuel), `/d/[course]`, `/r`, `/s`, plus `/admin` pour la console opérateur.

## Tech

Le monorepo a deux vies. Côté app : Next.js 16 + React 19, Tailwind 4, Supabase SSR (`@supabase/ssr` + `supabase-js`), `@anthropic-ai/sdk` + `@anthropic-ai/claude-agent-sdk` + `@anthropic-ai/claude-code` pour les workflows agent, `@xyflow/react` pour les UIs graphes, `@monaco-editor/react` pour les blocs code, `@dnd-kit` pour le drag-drop, alphaTab et un shim VexFlow neutralisé pour la musique, Three.js (3D), D3 + Turf + topojson pour les cartes, et `@vercel/analytics`. Côté opérations : `simulate/`, `scripts/scrapers/piano-teachers/` (Google Maps, Trinity, RSL, Instagram, YouTube, vérification Playwright + export CSV), `agent-lab/`, `admin-simulation/`, avec des workspace globs ciblant `docs/portfolio/accounts/*/engagement/**`. Les migrations (40+ fichiers dans `supabase/migrations/`) couvrent courses, profiles, spark reviews, eval sessions, lyceum sessions + journeys + conversations, session attempts, intro JSX, teacher chats, block catalog + enrichments, curriculum library, curator actions, technologies/accessibilité, block dimensions et domains. `npm run dev` lance `next dev` à côté de `scripts/stripe-listen.js`, qui détecte automatiquement le CLI Stripe et forwarde `localhost:3000/api/stripe/webhook`. Le build chaîne `gen:snapshot` (catalog snapshot), `gen:registry` (registre de blocks) et `gen:curriculum` avant `next build`.

## Status

Produit d'Akhil Aryan, hébergé dans son GitHub. J'y contribue comme collaborateur externe via des PR fusionnées — feature work sur les blocks, le moteur Lyceum, les scrapers et l'infra. Le dépôt sert aussi de hub d'opérations pour le portefeuille d'Akhil (le pattern workspace sous `docs/portfolio/accounts/*/engagement/**` donne à chaque entreprise du portefeuille son propre package d'engagement). Développement actif jusqu'en mai 2026 ; le produit cible des élèves sur web (mobile ou laptop), avec Stripe en gating des tiers premium.
