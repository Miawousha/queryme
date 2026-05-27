---
name: "openclaw-config"
role: author
visibility: private
description: "Versioned config and state store for a personal long-running agent runtime (OpenClaw)."
year: 2026
last_active: "2026-02"
language: "Shell"
code_bytes: 431469
archived: false
tags: [agent, shell, infra]
---

openclaw-config is the on-disk config and state directory backing OpenClaw, a personal long-running agent runtime — provider/model registries, auth profiles, per-agent workspaces (main, inbox, robin), paired devices, cron jobs, shell completions, and a SQLite memory store, all kept as versioned files. Not a deployable codebase; it's the substrate the agent reads and writes against. Includes a WhatsApp channel config and a small canvas HTML test page. Private, edited continuously as the agent learns.
