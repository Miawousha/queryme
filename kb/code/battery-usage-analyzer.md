---
name: "battery_usage_analyzer"
url: https://github.com/ION-Altergo/battery_usage_analyzer
role: contributor
visibility: public
description: "Multi-layer segmentation model that labels battery operating modes, change points, and CC/CV phases from time series."
year: 2025
last_active: "2025-09"
language: "Python"
stars: 0
code_bytes: 61028
archived: false
tags: [battery, energy, python, library]
---

battery_usage_analyzer is the canonical home of a multi-layer segmentation model for battery time series, packaged on top of the Altergo SDK's `boiler_plate.Model` framework. Given current, SoC, and min/max cell voltage and temperature, `BatteryUsageAnalyzer.process` emits Layer 0 operating modes (charge / discharge / idle), Layer 1 data-driven change points from a composed multi-signal change score with robust z-scoring and a minimum-gap constraint, and Layer 2 domain phases (rest, CC charge, CV charge, discharge) using majority-labelled segments. The repo follows the same two-layer template as the personal `battery-digital-twin-models` repo (shared README, shared `entrypoint.py`, shared `models/` package layout) but houses a different model set — analyzer and `eq_cycles` here, vs. `eq_cycles` and `adv_eq_cycles` on the personal side — so the framework is shared, the science is not duplicated. This ION-Altergo copy is the canonical location for the usage analyzer.

## What

Turns raw battery telemetry (current, SoC, cell-level voltage and temperature extremes) into a labelled timeline — what mode the battery was in at every instant, where its behaviour changed, and which CC/CV/rest phase each segment belongs to. Downstream analytics (cycle counting, degradation models, dashboards) consume these labels rather than parsing raw signals themselves, which keeps the science centralised.

## Tech

Built on the Altergo SDK's `boiler_plate.Model` framework — `@register_model("battery_usage_analyzer")` exposes the class, `model.json` carries the manifest, and `entrypoint.py` delegates to `execute_altergo_models`. Layer 0 is rule-based on signed current and SoC delta. Layer 1 computes per-second derivatives over `current`, `soc`, `v_cell_min`/`v_cell_max`, `t_cell_min`/`t_cell_max`, EWM-smooths them, applies robust z-scoring (median/MAD) via `robust_z`, composes a multi-signal change score via `compose_change_score`, picks peaks over threshold with `detect_peaks_over_threshold`, and enforces a minimum gap via `enforce_min_gap`. Layer 2 takes Layer 1 boundaries and assigns the dominant phase per segment via `majority_label_per_segment`. The repo shares the README, `entrypoint.py`, and `models/` layout with the personal `battery-digital-twin-models` repo — a template sibling, not a fork — but each houses a distinct model set.

## Status

Canonical ION-Altergo location for the usage analyzer (the personal `battery-digital-twin-models` repo carries `eq_cycles` and `adv_eq_cycles` instead). Active in 2025 (last touch September 2025), public visibility within the ION-Altergo org. Ships with a `run_tests.py`, model-specific README, `MODEL_CREATION_GUIDE.md` documenting how to add a new model to the framework, and a `documentation/` folder. The labels it emits are consumed by other models in the Altergo battery toolchain.
