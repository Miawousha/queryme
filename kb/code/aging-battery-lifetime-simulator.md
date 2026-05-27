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
