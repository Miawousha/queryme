---
name: "sop"
url: https://github.com/ION-Altergo/sop
role: contributor
visibility: private
description: "State-of-Power — max sustainable charge/discharge current over a 1–10 min horizon, Thevenin + ECM."
year: 2025
last_active: "2025-09"
language: "Python"
code_bytes: 52763
archived: false
tags: [battery, python, simulation]
---

sop is the State-of-Power model on the Altergo digital-twin platform — over a configurable 1–10 minute horizon, it computes the maximum current the pack can sustain in charge and discharge before hitting a voltage, current, power, SoC, or thermal limit. The physics is a Thevenin terminal relation `V = OCV ± I*R` enforced at end-of-horizon SoC, with bilinear OCV(SoC,T) and R(SoC,T) lookup tables, optional 3-RC ECM giving `R_eff(τ) = R0 + Σ Rᵢ(1 − exp(−τ/τᵢ))` with SoC/temperature/SoH-dependent scaling, plus PCS kW caps mapped to equivalent currents and coulomb- or energy-based SoC-window gates. Built on the model-boilerplate scaffold, alongside an `eq_cycles` model in the same repo.

## What
Outputs four time series: `sop_continuous_discharge_kw`, `sop_continuous_charge_kw`, `sop_continuous_net_kw` (discharge positive, charge negative), and an integer `sop_limiter_code` whose sign and value identify which constraint binds at each instant (±1 voltage, ±2 hardware current, ±3 PCS power, ±4 SoC window, ±5 thermal, ±6 safety table, 0 = unbounded). Consumers are energy-management systems and dispatch optimisers that need to know "what's the most kW I can offer to the grid for the next 5 minutes" without risking a limit trip. The `eq_cycles` model shipped in the same repo is unrelated: it integrates `|I|*dt / (2*capacity)` into equivalent full-cycle counts with optional efficiency and SoH compensation.

## Tech
`models/sop/sop.py` is a `StateOfPowerModel(Model)` ~2000 lines. For each timestamp it: (1) interpolates `OCV_now`, `R_now` from the bilinear OCV(SoC,T) and R(SoC,T) tables, (2) runs `iterations` (default 2) fixed-point passes on `SOC_end = SOC_now ± I*τ/(3600*capacity)` to converge end-of-horizon OCV, (3) solves the binding voltage equation `V_min = OCV_end - I*R_eff(τ)` for discharge current and `V_max = OCV_end + I*R_eff(τ)` for charge, (4) takes the min/max against hardware current caps, thermal current limit series, PCS kW caps (converted via `I = P/V`), and SoC-window caps from coulomb or energy gates. The optional `ecm_enable` path builds `R_eff(τ) = R0 + Σᵢ Rᵢ*(1 − exp(−τ/τᵢ))` for 1-, 2-, or 3-RC, with each `Rᵢ` scaled by SoC factor × temperature factor × `(1 + soh_coeff*(1-SoH))`. A `sop_safety_enable` table lets ops apply a multiplicative 0–1 derate per (SoC, T) cell. Entrypoint is 13 lines: `execute_altergo_models(...)` from the boilerplate, same as `soc`.

## Status
Production model since 2025. Used by EMS / dispatch consumers that need predicted operating envelope; the limiter code is what lets dashboards explain *why* a pack can't deliver more (binding constraint surfaced, not just clipped). Repo last touched 2025-09, version 1.1.0. Co-resident `eq_cycles` model is v2.1, low computational cost, used for lifetime / warranty tracking against equivalent full-cycle budgets.
