---
name: "battery-digital-twin-models"
url: https://github.com/Miawousha/battery-digital-twin-models
role: author
visibility: public
description: "Reference Python models (equivalent-cycle counters) packaged for Altergo's digital-twin runtime."
year: 2025
last_active: "2025-09"
language: "Python"
stars: 0
code_bytes: 37001
archived: false
tags: [battery, energy, python, library]
---

battery-digital-twin-models is a reference Python package showing how to ship battery models for Altergo's digital-twin runtime. Two models ship today: `eq_cycles` (simple coulombic-throughput cycle count) and `adv_eq_cycles` (an LFP-tuned equivalent-cycle counter that weights throughput by sustained C-rate, temperature with a Q10 cyclic factor and low-T charge surcharge, and a smoothstep SOC stress model). Each model subclasses `Model` from the `altergo_sdk` and registers itself via `@register_model`; `entrypoint.py` is a thin wrapper that calls the SDK's `execute_altergo_models` boilerplate. Open-source so model authors can copy the pattern without seeing the SDK internals.
