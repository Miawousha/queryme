---
name: "demo-eq-cycle-model"
url: https://github.com/ION-Altergo/demo-eq-cycle-model
role: contributor
visibility: private
description: "Equivalent-cycle counter for a battery current trace — Ah-throughput divided by 2x nominal capacity."
year: 2025
last_active: "2025-09"
language: "Python"
code_bytes: 2793
archived: false
tags: [battery, python, demo]
---

demo-eq-cycle-model is a small Python demo that computes cumulative equivalent cycles from a battery current time series: `eqCycles = cumsum(|I|·dt) / (2·Cnom)`. The estimator lives in `tools/eq_cycle_estimator.py`; `main.py` loads a sample CSV, runs it against a 56 Ah nominal capacity, and plots eqCycles alongside voltage with Plotly. Standalone demo of the equivalent-cycle formula — not platform-deployed, no Altergo SDK calls.

## What
The estimator takes a DataFrame indexed by timestamp with a `Current` column, computes `time_diff` in hours from consecutive index values, multiplies by `|Current|` to get per-step Ah throughput, divides by `2·Cnom` to convert Ah into equivalent full cycles, and returns the cumulative sum. The included `someCycleData.csv` is a single hard-coded cell trace; running `main.py` opens an interactive Plotly chart with eqCycles on the left axis and Voltage on the right.

## Tech
Pure pandas + numpy + Plotly — 2.8 kB of code total. No Altergo SDK, no configuration file, no entrypoint scaffold. The convention `Ah / (2·Cnom)` (half-cycle counting both directions) matches the formula used in `effective-capacity-benchmark-model` and `hppc_analysis` downstream.

## Status
Teaching example showing the eqCycles formula in isolation, written 2025 alongside the larger battery-digital-twin work. Not deployed, not maintained as a product; used as a reference snippet when explaining cycle counting to other engineers or stakeholders.
