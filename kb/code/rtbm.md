---
name: "rtbm"
url: https://github.com/ION-Altergo/rtbm
role: contributor
visibility: private
description: "Real-Time Battery Model — physics-based BMS simulator on the Altergo SDK and lair battery_iq core."
year: 2025
last_active: "2025-09"
language: "Python"
code_bytes: 32804
archived: false
tags: [battery, python, simulation]
---

rtbm (Real-Time Battery Model) is an Altergo-registered model that simulates a battery system step-by-step from input series of power, current, temperature, and SoC. `models/rtbm/rtbm.py` builds Battery/Cell/Stack objects from a `simspec.json` using `lair.components.battery_iq`, runs `batteryStateMachine` transitions with safety checks and cooling logic, and returns voltage, temperature, current, SoC, and power as pandas Series. `entrypoint.py` pulls the asset from Altergo, derives the simspec via `BatteryArchitectureBuilder`, and delegates execution to `altergo_sdk.boiler_plate.execute_altergo_models`.

## What
Inputs: four time series on an Altergo asset — `power`, `current`, `temperature`, `soc`. Outputs: five simulated series — `voltage`, `temperature`, `current`, `soc`, `power` — uploaded back as digital-twin sensors on the same asset. The model exists so the platform can produce expected-vs-actual diagnostics on real battery fleets: deviation between measured and simulated voltage/SoC flags degradation, anomalies, or sensor faults. Consumed by Altergo workers; one execution per asset per scheduled window.

## Tech
`Rtbm` subclasses the SDK `Model` base class and registers via `@register_model("rtbm", metadata={category: "Performance", complexity: "Simple", computational_cost: "Low"})`. The simulation loop comes from `lair.components.battery_iq.clone.batteryStateMachine` — adaptive time-stepping driven by `update_time_step`, cooling logic, thermal safety cutoffs, depth-1 sim mode (`SIM_TARGETED_DEPTH = 1`, stack-level granularity). `BatteryArchitectureBuilder` walks the asset's blueprint hierarchy to build the lair `Battery` of `Stack`s of `Cell`s and emit a `simspec.json`. Output sensors are aggregated via `dataframeFromSensors`. Plotly debug dashboards available when `debug_mode` is on.

## Status
Active in 2025 as the canonical starting point for new battery models on Altergo — newer client-specific models (impedance, SoH, cell imbalance) fork this layout. Last active 2025-09. Contributor role — Alexandre owns the rtbm model code and the entrypoint wiring; the platform team maintains the underlying SDK and lair.
