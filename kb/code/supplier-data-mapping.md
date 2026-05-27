---
name: "supplier-data-mapping"
url: https://github.com/ION-Altergo/supplier-data-mapping
role: contributor
visibility: private
description: "BESS signal classification toolkit — Cursor-orchestrated agents plus Python tools and JSON catalogs."
year: 2026
last_active: "2026-01"
language: "Python"
code_bytes: 119336
archived: false
tags: [ai, agent, python, tooling, battery, energy]
---

supplier-data-mapping is the toolkit ION-Altergo uses to turn supplier signal lists (CSV, Excel, JSON from battery-storage vendors) into standardized sensor mappings for the digital-twin platform. The "agents" are markdown runbooks (`AGENT_CLASSIFIER.md`, `ADD_SENSOR_TOOL.md`) that an LLM orchestrator — Cursor in practice — follows, backed by genuinely executable Python tooling: `ai_batch_processor.py` chunks data and calls the Anthropic SDK, `agent_io_tool.py` handles tabular I/O, `add_sensor_to_catalog.py` and `check_design_compliance.py` mutate and validate the catalog. State lives in `sensor_catalog.json` and `blueprint_catalog.json`; supporting docs codify signal classes, naming conventions, and sensor-model design so humans and agents share one source of truth. Active internal product.

## What
A new BESS vendor ships a signal list — SVOLT, Sunwoda, and equivalents — and the goal is a one-to-one mapping from their raw tags (with their own polarity conventions, alarm-severity scales, encodings) into a shared blueprint hierarchy (`ESRack`, `ESContainer`, `HVAC`, `Cooling`, `FireSafety`, etc.) so the digital twin compares fleets apples-to-apples. The classifier agent reads each supplier row, infers the standard sensor key and signal class, proposes catalog edits, and writes the resulting `supplier_mapping.json` with transforms (`value * scale + offset`) and alarm-severity remaps. Engineers drive the agent from Cursor; the human stays in the loop on schema-breaking changes through compliance checks.

## Tech
Two layers: declarative markdown runbooks under `agents/` that any LLM can follow, and Python tools under `tools/` and `scripts/` that the runbook invokes. `tools/ai_batch_processor.py` is deliberately domain-agnostic — it chunks an input file, calls `anthropic.Anthropic()` with the orchestrator-supplied prompt, streams structured metadata to stdout and human logs to stderr. `tools/agent_io_tool.py` handles CSV/JSON/Excel I/O; `scripts/add_sensor_to_catalog.py` mutates `sensor_catalog.json` in place, `scripts/check_design_compliance.py` enforces naming and blueprint rules, `scripts/verify_catalog_completeness.py` and `json_to_excel.py` round out validation and export. Source of truth is two JSON files (`sensor_catalog.json` with hybrid blueprint + group_id architecture, `blueprint_catalog.json`); `docs/` codifies signal classes and polling rates, naming conventions, and sensor-model design as agent-readable reference.

## Status
Active product as of January 2026 (v0.5.0 in CHANGELOG), with SVOLT and Sunwoda mappings shipped and the Phase 2 roadmap targeting two more suppliers, PCS, and transformer catalogs. Used internally by integration engineers onboarding suppliers; agents catalog and validate, humans review PRs. Private GitHub repo on the ION-Altergo org.
