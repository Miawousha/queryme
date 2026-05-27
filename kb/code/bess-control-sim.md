---
name: "bess_control_sim"
url: https://github.com/ION-Altergo/bess_control_sim
role: contributor
visibility: private
description: "BESS dispatch simulator with PID power-regulation, transformer losses, and a Dash configurator."
year: 2025
last_active: "2025-05"
language: "Python"
code_bytes: 85934
archived: false
tags: [battery, energy, python, simulation]
---

bess_control_sim is a Python simulator for the EMS control loop of a multi-container BESS site. Models a fleet of containers behind a 30 MVA IDT transformer with four LV inputs (per-input ratings, iron + copper losses, proportional redistribution when an input saturates), SoE-dependent charge and discharge C-rate curves, and a `PlantPowerPID` controller plus an optional imbalance-compensation PID. A Dash app exposes the configuration as a left panel (sim duration, containers per LV input, transformer rating, PID toggles) and renders the resulting power, SoE, and per-LV-input timeseries in Plotly. Internal sandbox for iterating on dispatch logic before it touches the production EMS.

## What
Takes in a target plant-power setpoint plus a site configuration and produces a time-resolved dispatch: instantaneous container power, SoE per container, per-LV-input loading, and transformer-side power after losses. The aim is to answer "does this control law deliver the requested AC power without overshooting any LV-input rating or violating C-rate envelopes?" before tuning gains on the real EMS.

## Tech
`bess_model.py` builds the topology (containers grouped under four LV inputs, IDT transformer with iron + copper loss model, proportional redistribution when an input saturates); `sim.py` integrates the loop step by step with `PlantPowerPID` at the plant level and an optional second PID compensating per-input imbalance; SoE-dependent charge/discharge C-rate curves clamp each container. `dash_app.py` wires a configurator (sim duration, containers per LV input, transformer rating, PID toggles) to `plotting.py` Plotly traces. Pure Python — no Altergo SDK or platform dependency.

## Status
Internal control-logic sandbox at Altergo, last active 2025-05. Used to prototype dispatch and imbalance-compensation strategies before they land in the production EMS.
