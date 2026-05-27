---
name: "cellsos"
url: https://github.com/ION-Altergo/cellsos
role: contributor
visibility: private
description: "Cell-level safety and stress-scoring model with 2D current derating, deployable on the Altergo SDK."
year: 2025
last_active: "2025-11"
language: "Python"
code_bytes: 31506
archived: false
tags: [battery, python]
---

cellsos is a Python `CellLimitsModel` built on the Altergo `AltergoModelBoilerplate`, monitoring lithium cell voltage, temperature, and current against their safe operating limits. Dynamic charge and discharge current limits are interpolated from a 2D temperature × SOC derating lookup (`current_limits_table.json`) via `scipy.RegularGridInterpolator`; outputs include per-parameter safety margins, a combined minimum margin, an instantaneous 0–100 % stress score, time-integrated cumulative stress, and an overall OK/Warning/Critical safety status. Internal model repo wired through the SDK to deploy against live digital-twin assets.

## What
Consumes live cell-level telemetry (V, T, I) from a digital-twin asset along with the cell's safe-operating envelope and a 2D temperature × SOC derating table. Emits a continuous stream of safety signals an operator can alert on and a stress score the analytics layer can integrate over time: how close each parameter sits to its limit, where the combined margin is tightest, how stressed the cell is right now, and how much accumulated stress it has taken on so far.

## Tech
`models/cell_limits/cell_limits.py` holds the single `CellLimitsModel`. Dynamic charge and discharge current ceilings come from `current_limits_table.json` interpolated with `scipy.interpolate.RegularGridInterpolator` over temperature and SOC. Per-parameter margins are normalised to their distance from the limit; the combined safety margin is the minimum across V/T/I; the stress score maps 0 % (deep inside the envelope) to 100 % (at the limit), then accumulates over time for the cumulative stress output. Tri-state OK/Warning/Critical falls out of configurable margin thresholds. `entrypoint_simple.py` and `entrypoint_advanced.py` register the model for SDK deployment.

## Status
Internal Altergo digital-twin model, last active 2025-11. Deployed via the SDK against live cell assets to feed safety dashboards and aging analytics.
