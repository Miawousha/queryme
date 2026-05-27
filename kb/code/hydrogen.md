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
