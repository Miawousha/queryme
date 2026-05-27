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
