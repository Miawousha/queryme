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

## What
Input is one live battery asset on Altergo with measured Current/Voltage/SoC/Temperature/Power/Ambient Temperature sensors over a recent window (default 24h before now). Output is a separate `RTBM-<source-sn>-DEMO` clone asset, freshly created or wiped per run, populated with simulated per-stack Voltage/Temperature plus aggregate battery sensors. The workflow exists so the platform can publish a "perfect twin" alongside the real one — anything the real asset does, the clone replays through physics, and downstream diagnostics compare them.

## Tech
`get_or_create_clone_asset` handles asset lifecycle: matches by serial number, optionally erases data or deletes-and-recreates assets-with-children, then assembles stacks from the source blueprint's `Stacks` interface. `prepare_simulation_data` fetches sensors with `getAssetSensorData`, forward-fills, and runs through `interpolateValue`. Sim runtime config comes from `configurationValues.globalSettings` / `simulationSteps` / `runTimeSettings` mapped to lair `GlobalSettings` / `SimulationStepSettings` / `ScenarioSettings` by `lair_override.py`. `sim_setup.run_sim` drives `lair.components.battery_iq.clone.run_clone_simulation`. `simulation_output.process_simulation_results` splits the multi-stack output dataframe (`Voltage|0`, `Temperature|0`, ...) per child asset and pushes via `dataUpdateMethod`.

## Status
Production workflow shipped as an Altergo function in 2024, demoed against the Rikuti (`RK-WIT-001`) asset. Last active 2024-10; predates the model-boilerplate registry pattern. Contributor role — Alexandre owns `sim_setup.py`, `simulation_output.py`, `lair_override.py` and the asset-lifecycle handling. Architectural reference for later one-asset-per-fault workflows like rtbm-dataset-generator.
