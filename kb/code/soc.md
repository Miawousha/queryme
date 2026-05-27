---
name: "soc"
url: https://github.com/ION-Altergo/soc
role: contributor
visibility: private
description: "Dual-bound SoC estimator — coulomb counting + OCV lookup with Peukert and multi-RC dynamics."
year: 2025
last_active: "2025-10"
language: "Python"
code_bytes: 231835
archived: false
tags: [battery, python, simulation]
---

soc is the current State-of-Charge estimator for the Altergo digital-twin platform — a dual-bound algorithm that runs coulomb counting and OCV-table lookup in parallel and merges them, with asymmetric error margins so each step emits SoC plus an uncertainty band. Built on the model-boilerplate scaffold (`register_model("soc")`); the core handles Peukert compensation on discharge, multi-RC dynamic voltage with temperature-compensated time constants, median + low-pass OCV filtering, directional constraints, rest detection, and SoH-scaled effective capacity. Supersedes `soc-model` (2024); ships a historical-SoC variant for iterative backfit on past data alongside the realtime estimator.

## What
The realtime `soc` model consumes `voltage`/`current`/`temperature` time series plus a `battery_config` blob (OCV(SoC,T) table, RC values, Peukert exponent) and an optional `soh` series; it emits a primary `soc`, an uncertainty width `soc_bounds`, the back-computed `ocv_estimated`, and four debug bounds (`soc_coulomb_high/low`, `soc_ocv_high/low`). The `historical_soc` variant in the same repo solves a different problem: detect high-quality rest "anchors" (`|I|` small and `|dV/dt|` small for ≥N minutes), map each anchor's voltage to a SoC via lab-validated OCV curves, then fit the effective capacity between consecutive anchors so coulomb counting hits both anchor SoCs exactly — RANSAC fuses anchor-pair capacities into a continuous `C_eff(t)` and SoH series, with the explicit rule that OCV curves come from lab data, never field-learned, to avoid circular drift.

## Tech
Two models share the repo: `models/soc/soc.py` (`SOCEstimator(Model)`, ~1500 lines) and `models/historical_soc/historical_soc.py` (`HistoricalSOCEstimator`, anchor-based with `sklearn.linear_model.RANSACRegressor`). The realtime estimator keeps separate high/low coulomb counters with asymmetric current errors (`I*(1±rel_err) ± abs_err`), applies Peukert only when `|I|` exceeds a rest threshold, runs an RC stack `V_terminal = OCV - R0*I - Σ V_RCᵢ` where each `V_RCᵢ` decays as `exp(-Δt/τᵢ)` recomputed per timestep, median-filters the back-computed OCV with a 16-sample window, then low-pass-filters and looks up SoC in a bilinear OCV(SoC,T) table with charge/discharge hysteresis selection. Updates are gated: continuous coulomb counting, full SoC recompute only when accumulated charge crosses `soc_update_threshold` (0.1% of capacity) or `max_soc_update_interval` (60 s) elapses or rest is detected (`|I| < 0.05 A` for ≥30 min). Configuration falls back from blueprint params `BP/OCV_LookupTable` / `BP/Cell_Config` to local `battery_config.json`. The entrypoint is a 45-line shell that just calls `execute_altergo_models(altergo_arguments)` from `altergo_sdk.boiler_plate` — all platform plumbing (input lookup, output decimation, error reporting) is centralized in the SDK.

## Status
Production model since 2025; current version 1.0 on the platform. Lives in `/models/soc/` (realtime, OCV-based recalibration) and `/models/historical_soc/` (offline anchor-fit with three variants: `historical_soc.py`, `_iterative.py`, `_simple.py`). Repo carries ~230 kB of code plus calibration datasets, debug scripts (`debug_anchors.py`, `debug_historical_soc.py`, `debug_iterative_fitting.py`), self-discharge test outputs (`self_discharge_factors.png`), and a `model_creation_guide.md`. Quoted accuracy ±2–5% SoC under normal conditions, with `soc_bounds` exposing real-time confidence to downstream consumers. Last commit 2025-10.
