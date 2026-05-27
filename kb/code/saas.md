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

## What

The player loads a Phaser scene (a `Level` scene preloaded by `Preload`) and finds a 2D space arena with their own ship, a few seeded drone ships, a missile system with lock-on targeting, and a HUD (`PlayerStatus`) on top of a starfield. Input goes over the WebSocket as `inputUpdate` messages; the server resolves movement, missile fire cooldowns, drone behaviour, and target locks, then broadcasts authoritative state back to all clients. Targeting is a `toggleTarget` event the client sends to pick or drop a missile lock on another ship.

## Tech

Two packages, no monorepo tool — just sibling directories sharing a `package-lock.json` at the root. `game-server` is NestJS 11 with `@nestjs/platform-socket.io` and `@nestjs/websockets`; the `GameGateway` (`src/game/game.gateway.ts`) hard-allows CORS from `http://localhost:3001` and delegates to `GameService` (`src/game/game.service.ts`), which holds the world (`ships`, `missiles`, `lastMissileFireTimes`) and ticks via `setInterval` at a `fixedDelta` of `1/30` s — a 30 Hz server loop. Ships split into `PlayerShip` and `DroneShip` subclasses of a shared `Ship`; missiles have a 5000 ms lifetime and 25-unit thrust. `game-client` is the Phaser 3.80 + Vite TypeScript template with `socket.io-client@4`, scenes authored as `.scene` files alongside their `.ts` counterparts in Phaser Editor.

## Status

Personal sandbox. Last activity 2025-02. Not deployed, no shipping target — built to explore the loop of an authoritative WebSocket server driving a Phaser client. The misleading `saas` slug is the only thing left from a prior framing.
