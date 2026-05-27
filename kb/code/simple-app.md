---
name: "simple-app"
url: https://github.com/ION-Altergo/simple-app
role: contributor
visibility: private
description: "Empty starter scaffold for an Altergo platform app — entrypoint, settings, no logic."
year: 2024
last_active: "2024-10"
language: "Python"
code_bytes: 740
archived: false
tags: [python, demo]
---

simple-app is the empty starter scaffold for an Altergo platform "app" (as opposed to a model) — `entrypoint.py` initializes the Altergo SDK client, reads `configurationValues`, and ends on a `# Your logic here` comment. No README, no real code; `altergo-settings.json` declares a single placeholder parameter. Reference scaffold, not a project.

## What
Starting point an Altergo customer or internal developer forks to build a custom platform "app" — a unit of code the platform schedules and runs against assets, distinct from the "model" type. The repo gives them a working SDK client and parameter wiring; everything past that is theirs to fill in.

## Tech
Four files: `entrypoint.py` (`extract_altergo_parameters` → `Client(functionArguments=…)`), `altergo-settings.json` (declares `type: "app"`, one `parameter1` placeholder), `dev-parameters.json` (local-run shim), `requirements.txt` (pins `altergo-sdk` from the bitbucket `release/alpha` branch). No tests, no logic, no README.

## Status
Last touched 2024-10. Lives as a reference template alongside the function-template scaffold (`simple-soc-model`); the two together cover the "app" and "model" sides of the Altergo function ABI. Not a deliverable, used by other repos as a starting point.
