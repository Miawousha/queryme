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
