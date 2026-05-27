---
name: "saas"
role: author
visibility: private
description: "Jeu navigateur temps réel : serveur NestJS WebSocket couplé à un client Phaser 3 / Vite."
year: 2025
last_active: "2025-02"
language: "TypeScript"
code_bytes: 69275
archived: false
tags: [typescript, sandbox]
---

saas est un bac à sable en deux packages pour un jeu navigateur temps réel (le nom du slug est un reliquat d'une ancienne idée — ce n'est pas un SaaS). `game-server` est une application NestJS 11 dont le `GameGateway` fait tourner une boucle WebSocket socket.io qui suit les joueurs, reçoit des messages `inputUpdate` et diffuse l'état ; `game-client` est un client Phaser 3 + Vite en TypeScript avec une logique de missiles/radar/ciblage (vaisseaux, symboles de lock, starfield) montée dans Phaser Editor. Expérience personnelle d'architecture multijoueur temps réel ; non déployé.

## What

Le joueur charge une scène Phaser (une scène `Level` préchargée par `Preload`) et arrive dans une arène spatiale 2D avec son propre vaisseau, quelques drones seedés, un système de missiles à lock-on et un HUD (`PlayerStatus`) par-dessus un starfield. L'input passe par WebSocket en messages `inputUpdate` ; le serveur résout déplacements, cooldowns de tir, comportement des drones et locks de cible, puis re-broadcaste l'état autoritatif à tous les clients. Le ciblage se fait via un événement `toggleTarget` que le client envoie pour accrocher ou lâcher un lock missile sur un autre vaisseau.

## Tech

Deux packages, pas d'outil monorepo — juste des dossiers frères partageant un `package-lock.json` à la racine. `game-server` est NestJS 11 avec `@nestjs/platform-socket.io` et `@nestjs/websockets` ; le `GameGateway` (`src/game/game.gateway.ts`) ouvre CORS uniquement à `http://localhost:3001` et délègue à `GameService` (`src/game/game.service.ts`), qui détient le monde (`ships`, `missiles`, `lastMissileFireTimes`) et tick via `setInterval` à un `fixedDelta` de `1/30` s — boucle serveur à 30 Hz. Les vaisseaux se déclinent en `PlayerShip` et `DroneShip` sur une base `Ship` commune ; les missiles ont une durée de vie de 5000 ms et une poussée de 25. `game-client` est le template Phaser 3.80 + Vite TypeScript avec `socket.io-client@4`, scènes éditées en `.scene` à côté de leur `.ts` dans Phaser Editor.

## Status

Bac à sable personnel. Dernière activité 2025-02. Non déployé, sans cible de production — construit pour explorer la boucle d'un serveur WebSocket autoritatif pilotant un client Phaser. Le slug `saas` trompeur est le seul reliquat d'une ancienne idée.
