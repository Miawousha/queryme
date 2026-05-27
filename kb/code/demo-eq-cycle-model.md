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
