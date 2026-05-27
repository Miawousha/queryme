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
