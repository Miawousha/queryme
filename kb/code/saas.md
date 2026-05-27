---
name: "saas"
role: author
visibility: private
description: "Real-time browser game: NestJS WebSocket server paired with a Phaser 3 / Vite client."
year: 2025
last_active: "2025-02"
language: "TypeScript"
code_bytes: 69275
archived: false
tags: [typescript, sandbox]
---

saas is a two-package sandbox for a real-time browser game (the slug is a leftover from an older idea — it's not a SaaS). `game-server` is a NestJS 11 app whose `GameGateway` runs a socket.io WebSocket loop that tracks players, accepts `inputUpdate` messages, and broadcasts state; `game-client` is a Phaser 3 + Vite TypeScript client with a missile/radar/targeting setup (ships, lock symbols, starfield) authored in Phaser Editor. Personal experiment in real-time multiplayer architecture; not deployed.
