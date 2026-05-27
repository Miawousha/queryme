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
