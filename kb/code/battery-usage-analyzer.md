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
