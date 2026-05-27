---
name: "impedance"
url: https://github.com/ION-Altergo/impedance
role: contributor
visibility: private
description: "Event-driven DC internal-resistance (Rdc) estimator with EWMA trend and baseline-drift percentage."
year: 2025
last_active: "2025-10"
language: "Python"
code_bytes: 12129
archived: false
tags: [battery, python]
---

impedance is a battery-health model that estimates DC internal resistance from current-step events — not an EIS spectrum fitter, despite the repo name. `RdcTrendEstimator` in `models/rdc_trend_estimator/` detects raw current jumps above `di_threshold_abs`, takes median V and I in pre/post windows with a guard band around each step, computes `Rdc = |ΔV|/|ΔI|`, rejects MAD-based outliers, and emits a per-event Rdc series plus an EWMA trend and percent-change versus a configurable baseline. Built on the Altergo model boilerplate (`AltergoModelBoilerplate` driving the entrypoint), so the model deploys against live digital-twin assets with the SDK plumbing handled by the framework.
