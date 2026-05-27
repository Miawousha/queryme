---
name: "blueprint-creator"
url: https://github.com/ION-Altergo/blueprint-creator
role: contributor
visibility: private
description: "Interactive Rich-based CLI for browsing, extending, and converting Altergo blueprints via the SDK."
year: 2026
last_active: "2026-01"
language: "Python"
code_bytes: 275269
archived: false
tags: [python, tooling]
---

blueprint-creator is an interactive Python CLI ("BP Extender") that drives the Altergo SDK to manage blueprints across multiple environments. The menu walks an operator through environment selection, blueprint search and tree-view, parameter and schema inspection, child-hierarchy creation from simspec JSON, conversion between blueprint formats, and bulk deletion — with Rich-rendered tables, banners, and diff reports written under `data/`. Internal developer tooling for blueprint authoring at scale.

## What
An operator runs `run.py`, picks an environment from `envs/`, and lands in a Rich-rendered numeric menu — not a flag-based CLI. From there they search blueprints by name or ID, walk the tree of children, inspect parameter and schema definitions, generate a child hierarchy from a simspec JSON, convert legacy blueprints to the current format, or bulk-delete a list. Diff and conversion reports drop into `data/` so changes are reviewable before they ship.

## Tech
`bp_extender/cli.py` owns the menu loop; `client.py` wraps the Altergo SDK with env-scoped auth (`envs/<env>.json`); `extender.py` builds child hierarchies from simspec; `converter.py` handles format migration; `schema.py` introspects blueprint schemas; `cli_reports.py` writes the diff artifacts. Rich drives every table, banner, and progress indicator. Multi-env support lets the same operator hop between dev, staging, and prod without re-auth ceremony.

## Status
Active developer tooling at Altergo, last touched 2026-01. Used by the modelling team to keep blueprint catalogs in sync across environments and to bootstrap new asset hierarchies without hand-editing JSON.
