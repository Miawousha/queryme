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
