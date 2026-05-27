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

## What

The repo is the `~/.openclaw/` directory of a personal agent host, captured in git so config changes are inspectable and revertible. Top-level: `openclaw.json` is the central config; `agents/` holds one subdirectory per agent (`main`, `inbox`, `robin`), each with its own `auth.json`, `auth-profiles.json`, and `models.json`; `cron/jobs.json` schedules recurring agent tasks; `devices/paired.json` and `pending.json` track devices that have completed Ed25519 pairing with operator-scoped tokens; `identity/` holds the device's own keypair and auth state; `memory/main.sqlite` is the persistent memory store; `completions/` ships shell completions for bash/zsh/fish/PowerShell; `canvas/index.html` is a small JS test page that exercises `webkit.messageHandlers.openclawCanvasA2UIAction` (iOS) and the equivalent Android bridge to validate the agent's UI action channel from a webview.

## Tech

`openclaw.json` is a single JSON document the runtime merges with defaults. Sections: `meta` (last-touched version timestamps), `wizard` (onboarding state), `auth.profiles` (provider × mode tuples), `models` in `merge` mode listing custom OpenAI-compatible providers (e.g. nexos.ai, NVIDIA's hosted `moonshotai/kimi-k2.5`), `agents.defaults` (primary model, workspace path, `compaction.mode: safeguard`, `maxConcurrent: 4`, `subagents.maxConcurrent: 8`) plus an `agents.list` that overrides per agent, `hooks.internal` (boot-md, session-memory), `channels.whatsapp` (`dmPolicy: pairing`, `groupPolicy: allowlist`, `mediaMaxMb: 50`), and `gateway` (loopback HTTP on port 18789 with a token-mode auth and a Tailscale toggle, plus `nodes.denyCommands` that blocks `camera.snap`, `screen.record`, `calendar.add`, etc.). Backup copies `openclaw.json.bak.1..4` are kept on every meaningful write. Per-agent `auth-profiles.json` stores OpenRouter API keys with `usageStats` (lastUsed, errorCount) for fallback selection.

## Status

Private. Tracks an active personal install — `lastTouchedVersion: 2026.2.17`, `lastTouchedAt: 2026-02-19`. The `cron/jobs.json` is empty (jobs list `[]`); WhatsApp is the only plugin enabled. SQLite memory is small (~68KB). The repo exists so OpenClaw config edits — which happen frequently as the agent learns — have history.
