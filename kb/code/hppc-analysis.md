---
name: "hppc_analysis"
url: https://github.com/ION-Altergo/hppc_analysis
role: contributor
visibility: private
description: "HPPC pipeline: coulomb-counted SOC, OCV table from rest periods, physics-based ECM resistances at fixed time constants."
year: 2025
last_active: "2025-09"
language: "Python"
code_bytes: 48722269
archived: false
tags: [battery, python, data-only]
---

hppc_analysis is a single-file (~2 kLOC) HPPC pipeline that fits NMC cells from raw Altergo SDK pulls into a ready-to-use battery configuration. `hppc_analysis_full.py` segments each cycle around the discharge→charge current reversal, integrates current with `scipy.signal.savgol_filter`-smoothed coulomb counting to get SOC, extracts OCV from ≥25-minute rest periods, and computes R0/R1/R2 directly from voltage deltas at V_before / V_2s / V_5min / V_end with τ₁=5 min and τ₂=25 min fixed (no curve fit). Outputs an OCV CSV, ECM-parameter CSV, cycle summary, interactive HTML report, and `battery_config_from_analysis.json` consumed downstream by simulation code; the 48 MB repo size is almost entirely those bundled Plotly HTML reports.

## What
Input is one NMC cell (asset `NMC_CELL_1_CUSTOM_617` on `demo.altergo.io`) over a ~10-day HPPC test, pulled via `altergoClient.getAssetSensorData` for `Cycle_Number`, `Voltage`, `Current`, `Temperature`. The convention is that each cycle starts and ends at 100% SOC and hits 0% at the discharge→charge current reversal, so coulomb counting can be anchored cycle-by-cycle without drift accumulation. OCV points are only accepted when the rest-period voltage standard deviation is below 10 mV, and ECM fits are filtered for physical plausibility (1–100 mΩ for R0, 0.1–50 mΩ for R1/R2). The exported `battery_config_from_analysis.json` is the contract consumed by Lair-based simulators (cf. the `hydrogen` repo's BatteryArchitectureBuilder workflow).

## Tech
Single 74 kB script, ~2 kLOC, organized as a procedural pipeline: `load_full_dataset` → `identify_hppc_cycles` → per-cycle `calculate_proper_soc_for_cycle` + `find_rest_periods` + `extract_ocv_points` + `identify_pulses` → `fit_ecm_to_pulse` → `create_comprehensive_ocv_table` (21 SOC bins, ±5% window) → `generate_battery_config`. Stack: numpy, pandas, scipy (`savgol_filter` window 51, polyorder 3; `interp1d`; `curve_fit` imported but unused for R0/R1/R2), plotly subplots for the HTML report, altergo-sdk for data fetch. The repo carries an `archive_development_files/` and `archive_removed_files/` tree plus bundled HTML reports — code itself is small, but the artifacts blow the size to 48 MB.

## Status
Built 2025 against real NMC cell data on the Altergo demo tenant. Used as an offline pre-processing step: run once to characterize a cell, drop the JSON into Lair-based simulations. Not a deployed Altergo model (no `altergo-settings.json`, no boilerplate) — a standalone data-only analysis. Output JSON is the integration surface; everything else (CSVs, HTML) is for human review.
