---
name: "soc-model"
url: https://github.com/ION-Altergo/soc-model
role: contributor
visibility: private
description: "First-generation SoC estimator (2024) — single-script coulomb + OCV dual-bound, superseded by soc."
year: 2024
last_active: "2024-10"
language: "Python"
code_bytes: 24447
archived: false
tags: [battery, python, shelved]
---

soc-model is the 2024 first-generation State-of-Charge estimator for the Altergo platform — a single `Estimator` class (`estimator/soc_estimator.py`) doing the same coulomb-counting plus OCV-lookup dual-bound idea, with Peukert on discharge, RC dynamic voltage, and median-filtered OCV. The entrypoint pulls voltage/current/temperature from an activity window via the Altergo SDK, resamples to 1 Hz, runs the estimator row by row, and writes back `SoC`, `SoC Voltage High`, and `SoC Voltage Low`. Superseded by `soc` (2025), which migrated to the model-boilerplate scaffold and added temperature-compensated tau, SoH scaling, and directional OCV constraints.

## What
Batch backfit job: given a cell asset and a named activity window, compute SoC over that window and write it back as new sensor series so the platform UI can plot it next to measured voltage/current. Reads `bp_sensors` (voltage / current / temperature names), `bp_parameters` (cell capacity), and a `bp_datasets` cell-model JSON (OCV table, RC values, Peukert exponent) from the blueprint; emits five series — `[Altergo] SoC`, `SoC Current High/Low`, `SoC Voltage High/Low` — plus a clickable "Visualize" task output deep-linking into the factory UI.

## Tech
The `Estimator` carries dual `ocvH/ocvL`, `socIH/socIL` (current-based bounds), `socVH/socVL` (voltage-based bounds), and `ccH/ccL` coulomb counts. Per step it calls `countCoulomb(I, dt)` (Peukert factor `(|I|/I_ref)^(n-1)` applied on discharge), `updateSOCI()` when accumulated charge passes `chargeAcceptanceAh*10`, then `calculateNextOcvs(V, I, T=25°C)` which subtracts a sum of three RC voltage drops `vDyns[0..2]` from terminal V to back out OCV, runs a median filter, and reads SoC from the OCV table. Temperature is hardcoded to 25°C — a known limitation the next-gen `soc` fixes. Driven row-by-row via `df.apply`; resampling is `cell_asset.df.resample('S').asfreq().ffill().bfill()`; results pushed back with `sendSensorDataToAssets(updateMethod=REPLACE)`.

## Status
Last touched 2024-10. Was the first SoC model deployed on Altergo; lived on customer assets through 2024 before being replaced by `soc` (2025). Code archived for reference — current production traffic goes through the boilerplate-based successor.
