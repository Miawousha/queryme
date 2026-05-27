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
