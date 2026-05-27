---
name: "hydrogen"
url: https://github.com/ION-Altergo/hydrogen
role: contributor
visibility: private
description: "Time-stepped solar+battery+electrolyzer hydrogen-plant simulation comparing a legacy battery model against the Lair multi-scale battery."
year: 2025
last_active: "2025-03"
language: "Python"
code_bytes: 356501
archived: false
tags: [energy, battery, python, simulation]
---

hydrogen is a Python simulation of a solar-coupled green-hydrogen plant: a `HydrogenPlantSimulation` time-steps a `SolarPlant`, `Electrolyzer` (ramp limits, activation/deactivation thresholds, kg-H₂/kWh efficiency), `Battery`, static aux loads, and an `EMS` dispatcher row-by-row over a power or irradiance profile. `main.py` runs in three modes — `-legacy` (simple Battery class), `-lair` (a `BatteryArchitectureBuilder` built from a real Altergo blueprint, cell/module/stack-resolved), or `-both` for side-by-side comparison — with the PV stage optionally driven by `pvmodel.new_pv_power_generation` against CEC module/inverter databases pulled from Altergo. R&D tool for cross-checking the legacy lumped battery model against Lair's electrochemical-aware battery on identical solar+H₂ scenarios.

## What
Input is a CSV dataset (referenced by `power_profile_dataset_id` in the platform config) — either a precomputed power profile or raw irradiance/weather that gets converted to power via `run_pv_simulation` against CEC module + inverter databases. The plant model wires SolarPlant + Electrolyzer + Battery + AirCooledCondenser + two StaticLoads (`auxPlantLoads`, electrolyzer minimum aux) through an EMS dispatcher; for each timestep, EMS decides what flows where given electrolyzer ramp constraints, activation/deactivation thresholds, and battery state. Outputs a `simulationDf` of all per-step variables, a KPIs array, and optionally a static HTML simulation page; when `UPLOAD = True`, results are pushed back into Altergo as a fresh asset with dashboards. The Lair path runs an electrochemically-resolved battery (cell → module → stack), the legacy path a simple SOC-based Battery — the `-both` mode runs them on identical inputs so the two SOC/voltage trajectories can be diffed.

## Tech
Core sits in `balanced_simulation/`: `SolarPlant.py`, `Electrolyzer.py` (ramp limits, activation/deactivation, base + fractional H₂-production efficiency, kg-H₂/kWh conversion), `Battery.py` (legacy lumped), `EMS.py`, `EnergySystem.py`, and `HydrogenPlanSimulation.py` which composes them. The Lair branch uses `lair.components.battery_iq.battery_architecture_builder.BatteryArchitectureBuilder` against a "Test Battery" blueprint fetched from Altergo, yielding a `Battery` of `Cell` / `ElectroChemEntity` resolved at `LEVEL_MODULE` / `LEVEL_STACK`. PV modeling lives in `pvmodel/new_pv_power_generation.py`, driven by CEC module and inverter datasets pulled as Altergo dataset download URLs. `pyinstrument` is wired (commented out) for profiling Lair runs because the cell-resolved model is much slower than legacy. Parallel subdirs `demo_simulation/`, `realtime_h2_model/`, and `pvmodel/` contain related variants and a deployable real-time entrypoint.

## Status
Built 2024–2025, last active 2025-03. R&D / validation tool — not a customer-facing model. Used to validate Lair's multi-scale battery on a representative solar+H₂ scenario before publishing it for client deployments; the legacy/lair comparison is the headline check. 356 kB of Python; `UPLOAD` is gated false by default so the script runs cleanly offline against a real Altergo blueprint without polluting platform data.
