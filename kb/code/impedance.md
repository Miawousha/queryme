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

## What
Inputs are aligned UTC-indexed pandas Series for `current` (A) and `voltage` (V), plus optional `temperature` (C) and a scalar `baseline_rdc` (Ω). The validator refuses anything misaligned, non-monotonic, or empty — no implicit resampling. Detection uses raw first-difference (`cur.diff().abs() >= di_threshold_abs`, default 10 A); for each step at `t*`, pre/post medians come from `[t*-guard-pre, t*-guard)` and `[t*+guard, t*+guard+post)` (defaults 60 s / 60 s / 60 s), giving `Rdc_event = |ΔV| / |ΔI|`. Outputs three series at event timestamps: raw `rdc`, `rdc_trend` (EWMA over `ewma_span_events`, default 10), and `rdc_change_pct` versus baseline (seeded from the first `baseline_first_n` events or from a config-provided scalar). MAD-based robust z-score (`outlier_sigma`, default 3.0) drops outliers when `drop_outliers` is on.

## Tech
Subclasses `altergo_sdk.boiler_plate.Model`, declared in `models/rdc_trend_estimator/model.json` (logical I/O) and wired in `altergo-settings.json` (platform sensor names: `Current` / `Maximum Voltage` / `Temperature` → `RDC Trend/DC Internal Resistance` + `RDC Trend/Rdc Trend` + `RDC Trend/Rdc Change %`). The repo ships a multi-model registry (`enabled_models = "eq_cycles,adv_eq_cycles,soc_eq_cycles,rainflow_cycles,rdc_trend_estimator"`), but only `rdc_trend_estimator` is implemented here. Two entrypoints — `entrypoint_simple.py` calls `boilerplate.execute()` once for the auto path, `entrypoint_advanced.py` exposes the four phases (prepare → execute → debug → upload) for custom pre/post-processing. Config defaults live in `model.json`; `compute_type` supports `incremental` / `full` / `manual` with `max_days_period_compute` to cap each run.

## Status
Active 2025, last touched October. Production-grade model — deploys against live Altergo battery digital twins, computes Rdc trends incrementally, optionally uploads to platform dashboards. The boilerplate pattern here (`AltergoModelBoilerplate` driving everything) is the modern Altergo model template; the `effective-capacity-benchmark-model` repo is an older single-model scaffold that didn't make it to this generation.
