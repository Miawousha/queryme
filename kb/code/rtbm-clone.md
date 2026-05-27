---
name: "rtbm-clone"
url: https://github.com/ION-Altergo/rtbm-clone
role: contributor
visibility: private
description: "Digital-twin clone workflow — mirrors a live battery asset and replays its profile through the lair simulator."
year: 2024
last_active: "2024-10"
language: "Python"
code_bytes: 24389
archived: false
tags: [battery, python, simulation]
---

rtbm-clone is the Altergo function that maintains a digital-twin "clone" asset for a real battery. `main.py` fetches the source asset via the Altergo SDK, builds its lair `Battery` model with `BatteryArchitectureBuilder`, gets-or-creates a paired clone asset, pulls and interpolates the source's recent power/temperature/SoC datasets, and runs `rtbm_clone.sim_setup.run_sim` against the lair simulation engine (`GlobalSettings` / `ScenarioSettings` / `SimulationStepSettings`) before writing simulated stack and battery sensors back through `process_simulation_results`. Not a copy of the boilerplate — a distinct production workflow.
