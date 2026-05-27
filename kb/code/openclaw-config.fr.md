---
name: "openclaw-config"
role: author
visibility: private
description: "Dépôt versionné de configuration et d'état pour un runtime d'agent personnel (OpenClaw) en continu."
year: 2026
last_active: "2026-02"
language: "Shell"
code_bytes: 431469
archived: false
tags: [agent, shell, infra]
---

openclaw-config est le répertoire de configuration et d'état d'OpenClaw, un runtime d'agent personnel tournant en continu — registres de providers/modèles, profils d'auth, workspaces par agent (main, inbox, robin), appareils appairés, jobs cron, complétions shell et mémoire SQLite, le tout en fichiers versionnés. Ce n'est pas un codebase déployable ; c'est le substrat sur lequel l'agent lit et écrit. Comprend la configuration d'un canal WhatsApp et une petite page canvas HTML de test. Privé, modifié en continu au fil de l'apprentissage de l'agent.

## What

Le repo est le répertoire `~/.openclaw/` d'un hôte d'agent personnel, capturé dans git pour rendre les changements de config inspectables et réversibles. Au premier niveau : `openclaw.json` est la config centrale ; `agents/` contient un sous-dossier par agent (`main`, `inbox`, `robin`), chacun avec ses propres `auth.json`, `auth-profiles.json` et `models.json` ; `cron/jobs.json` planifie les tâches récurrentes ; `devices/paired.json` et `pending.json` suivent les appareils qui ont complété un pairing Ed25519 avec des tokens scope opérateur ; `identity/` détient la keypair et l'état d'auth du device ; `memory/main.sqlite` est la mémoire persistante ; `completions/` livre les complétions shell pour bash/zsh/fish/PowerShell ; `canvas/index.html` est une petite page JS de test qui exerce `webkit.messageHandlers.openclawCanvasA2UIAction` (iOS) et l'équivalent Android pour valider le canal d'actions UI de l'agent depuis une webview.

## Tech

`openclaw.json` est un document JSON unique que le runtime fusionne avec ses défauts. Sections : `meta` (timestamps de version), `wizard` (état d'onboarding), `auth.profiles` (tuples provider × mode), `models` en mode `merge` listant des providers OpenAI-compatibles custom (par ex. nexos.ai, le `moonshotai/kimi-k2.5` hébergé par NVIDIA), `agents.defaults` (modèle primaire, workspace, `compaction.mode: safeguard`, `maxConcurrent: 4`, `subagents.maxConcurrent: 8`) plus une `agents.list` qui override par agent, `hooks.internal` (boot-md, session-memory), `channels.whatsapp` (`dmPolicy: pairing`, `groupPolicy: allowlist`, `mediaMaxMb: 50`) et `gateway` (HTTP loopback port 18789 avec auth token-mode et toggle Tailscale, plus `nodes.denyCommands` qui bloque `camera.snap`, `screen.record`, `calendar.add`, etc.). Des backups `openclaw.json.bak.1..4` sont conservés à chaque écriture significative. Le `auth-profiles.json` par agent stocke les clés OpenRouter avec `usageStats` (lastUsed, errorCount) pour la sélection de fallback.

## Status

Privé. Reflète une install personnelle active — `lastTouchedVersion: 2026.2.17`, `lastTouchedAt: 2026-02-19`. La liste `cron/jobs.json` est vide (`[]`) ; WhatsApp est le seul plugin activé. La mémoire SQLite est petite (~68KB). Le repo existe pour que les éditions de config OpenClaw — fréquentes au fil de l'apprentissage de l'agent — aient un historique.
