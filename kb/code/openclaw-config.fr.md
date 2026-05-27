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
