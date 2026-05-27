---
name: "GrammairePT"
role: author
visibility: private
description: "SvelteKit grammar RPG where 8–13-year-olds fight monsters by tagging French word natures and functions."
year: 2025
last_active: "2025-05"
language: "Svelte"
code_bytes: 640091
archived: false
tags: [education, svelte, typescript]
---

GrammairePT is a pixel-art SvelteKit RPG that teaches French grammar to 8–13-year-olds by turning sentence analysis into combat. The home screen splits into a Quête mode — fight grammatical monsters whose vulnerabilities are word natures and syntactic functions, with XP and a player store — and an Arène mode where the player is invincible and can train against any monster. Built on Svelte 5, Vite, and a homemade SyMark XML markup that encodes natures (`<nom>`, `<verbe>`, …), syntactic functions (`<sujet>`, `<COD>`, …), and groups (`<GN>`, `<GV>`) aligned with the French BOEN; the parser turns SyMark sources into `Word` objects the battle and palette components consume.

## What

The game maps grammar to RPG mechanics. Monsters live in zones ("Zone 1: Natures basiques") and carry vulnerabilities (`{ nature: "nom" }`, `{ nature: "verbe" }`, …) — to attack, the player taps words in the displayed sentence and tags them with the right nature or function. A Nomotaur Novice carrying `<sujet><GN><determinant>Le</determinant><nom>chat</nom></GN></sujet>` is defeated by correctly tagging "chat" as a `nom`. Quête mode tracks HP, XP (50 reward for Apprentice monsters), level (1–50, growth `100 * 1.4^(level-1)`), critical hits, perfect victories, and consumable grammar tools (Amplificateur de Noms, Vision Verbale, Grammaire Parfaite); Arène is invincible-mode for free practice against any monster.

## Tech

SyMark v1.1 is the markup spec at the heart of the engine — twelve nature tags (`nom`, `verbe`, `adjectif`, `adverbe`, `determinant`, `pronom`, `preposition`, `conjCoord`, `conjSub`, `interjection`, `numeral`, `ponctuation`), six function tags (`sujet`, `COD`, `COI`, `attribut`, `CC`, `complNom`), five group tags (`GN`, `GV`, `GPrep`, `GAdj`, `GAdv`), with optional attributes (`genre`, `nombre`, `mode`, `temps`, `personne`, …) all aligned with the French BOEN vocabulary so the in-game labels match what students see in class. Monster definitions in `src/lib/data/monsters.ts` carry a `symarkContent` string the runtime parser turns into `Word` objects the battle UI renders. State lives in a Svelte 5 `playerData` store (`src/lib/stores/player-store.ts`) with persistence to `localStorage` and derived stores for accuracy, win rate, perfect-victory rate, and per-nature mastery levels (0–5). Routes are minimal: `/quest`, `/arena`, plus `/demo` and `/demo-consolidated` for marketing screenshots; no auth, no server, no SvelteKit endpoints — entirely client-side.

## Status

Personal project, last touched May 2025. Target audience is 8–13-year-olds learning French grammar (cycles 3 → collège); usable solo at home or as a teacher's demo on a class projector, since play state lives in `localStorage` per browser. Single-player only, no leaderboards, no account system. Real classroom adoption hasn't been pushed.
