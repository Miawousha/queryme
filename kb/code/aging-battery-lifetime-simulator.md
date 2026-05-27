---
name: "aging_battery_lifetime_simulator"
url: https://github.com/ION-Altergo/aging_battery_lifetime_simulator
role: contributor
visibility: private
description: "Lifecycle simulator that ages a `lair` Battery under power and ambient profiles with a state-machine safety envelope."
year: 2025
last_active: "2025-06"
language: "Python"
code_bytes: 89650
archived: false
tags: [battery, energy, python, simulation]
---

aging_battery_lifetime_simulator drives an electrochemical Battery from the internal `lair` library (Cell / Stack / ElectroChemEntity hierarchy with an attached SoH model) through a power-and-ambient-temperature profile to project how the pack ages. The main loop in `lifecycle_simulation.py` interpolates the load, runs `batteryStateMachine` to handle charge taper (5% before max SoC), 55 °C / 10 °C-hysteresis thermal cutoffs, and high/low voltage trips, then advances each element with `calculateNextStep(dt, T_amb)` on an adaptive timestep from `altergo_sdk.tools.sim.update_time_step`. Time series for SoC, SoH, calendar and cyclic aging, equivalent cycles, voltage, current and temperature are recorded via variance-thresholded `Sensor` appends, with tightened thresholds on the first and last 24 h "record days" for high-resolution boundaries.

## What

Takes a usage profile (power demand + ambient temperature time series, either uploaded as a dataset or built from a simple synthetic generator) and a battery component specification, and returns a projection of how SoC, SoH, calendar aging, cyclic aging, voltage, current and temperature evolve over the lifetime of the pack. Customers use it to validate whether a candidate cell chemistry and pack design survive a target duty cycle before procurement; the same script also produces the calibration evidence that feeds capacity-sizer warranty curves.

## Tech

Built on the internal `lair` battery library (`Battery` / `Cell` / `Stack` / `ElectroChemEntity` with pluggable `Soh` models) and the `altergo_sdk.tools.sim` module (`Sensor`, `update_time_step`). `batteryStateMachine` from `lair.components.battery_iq.clone` enforces the safety envelope — `maxSoC - 5%` charge taper, 55 °C cut-in / 45 °C cut-out thermal hysteresis, `lowVoltageSafetyCutoff` / `highVoltageSafetyCutoff` trips, current clamping. The timestep is adaptive: short during transients, long during rest. Recording uses variance-thresholded `Sensor` appends so the output stays compact for multi-year runs, with thresholds dropped to near-zero on the configured first/last "record days" so the boundary windows are fully resolved. `main.py` wraps the loop into an Altergo-platform job that reads `altergo-settings.json`, downloads the profile dataset, runs the simulation, and ships results back as Plotly graphs.

## Status

Active component of the Altergo battery-engineering toolchain in 2025; runs on the platform on demand as part of customer sizing and lifetime-validation studies. Authored as a contributor inside the ION-Altergo organisation. Not a one-off — the codebase has profile precaching, debug-mode local runs, and a profile-repetition utility for stress-testing chemistries against multi-year accelerated cycles.
