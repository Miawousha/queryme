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
