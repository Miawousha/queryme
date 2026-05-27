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

## What
Inputs come from a live BMS digital twin — per-cell and per-module voltage min/max/mean aggregates, pack current, and optionally cell temperatures. Outputs are three streams an operator can alert and trend on: a dispersion index plus OK/Warn/Alarm state for cells and modules (catches drifting weak cells before they trip), and an event-driven Rdc trend versus baseline with a percent drift readout (catches creeping resistance growth indicative of aging or contact degradation).

## Tech
`models/cell_imbalance/cell_imbalance.py` computes ΔV from voltage_min/voltage_max, normalises to a 0–1 index scaled by `alarm_threshold_mv` with a shaping exponent, applies optional `|TCV| * ΔT` temperature compensation, and mirrors the same pipeline at module granularity. `models/rdc_trend_estimator/rdc_trend_estimator.py` scans the current trace for steps above a configurable threshold, takes median V and I in pre- and post-step windows separated by a guard band, divides to get an event-level DC resistance, MAD-filters outliers, then maintains an EWMA against a baseline and reports a baseline-drift percentage. Both inherit `AltergoModelBoilerplate`; `entrypoint_simple.py` and `entrypoint_advanced.py` register them for SDK deployment.

## Status
Internal Altergo digital-twin model repo, last active 2025-10. Deployed against live BESS assets to surface cell-spread alarms and Rdc-aging trends to operations.
