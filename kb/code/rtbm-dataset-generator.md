---
name: "rtbm_dataset_generator"
url: https://github.com/ION-Altergo/rtbm_dataset_generator
role: contributor
visibility: private
description: "Matrix DoE framework that generates synthetic battery simulation datasets with controlled fault profiles."
year: 2026
last_active: "2026-01"
language: "Python"
code_bytes: 169798
archived: false
tags: [battery, python, simulation, data-only]
---

rtbm_dataset_generator is a matrix Design-of-Experiment framework for synthesizing battery training datasets. `main_matrix.py` walks the cross-product of power profiles × failure scenarios (one asset per profile-fault combination, plus baselines), loads-and-extends each CSV profile to a target duration, builds the lair `Battery` from a simspec via `BatteryArchitectureBuilder`, runs the simulation through `batteryStateMachine` with `check_and_apply_anomalies` injecting controlled faults (e.g. impedance spikes), and writes per-asset parquet + JSON datasets plus a DoE summary. Built on `altergo_sdk` and `lair.components.battery_iq`; powers training data for the real-time battery model.
