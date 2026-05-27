---
name: "cell-imbalance"
url: https://github.com/ION-Altergo/cell-imbalance
role: contributor
visibility: private
description: "Cell/module dispersion index plus event-driven Rdc trend estimator, deployable on the Altergo SDK."
year: 2025
last_active: "2025-10"
language: "Python"
code_bytes: 18425
archived: false
tags: [battery, python]
---

cell-imbalance is a Python repo of two battery models built on the Altergo `AltergoModelBoilerplate` so they run as deployable digital-twin jobs. `CellModuleImbalanceIndexModel` derives absolute spread in mV from cell `voltage_min`/`max` aggregates, a relative percentage against the mean, a 0–1 imbalance index scaled to a configurable alarm threshold with an exponent shaping factor, and a three-state OK/Warn/Alarm output, with optional temperature compensation that subtracts `|TCV| * ΔT` from the raw ΔV; module-level inputs are handled the same way when present. `RdcTrendEstimator` detects current steps above a threshold, computes median V and I in pre/post windows around each step, derives an event-level DC internal resistance `|ΔV|/|ΔI|`, optionally MAD-filters outliers, then tracks an EWMA trend versus a baseline.
