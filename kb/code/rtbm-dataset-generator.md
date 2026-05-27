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

## What
Driven by `doe.json`: a list of power profiles (CSV files indexed by timestamp), battery specifications (simspec paths, blueprint names), simulation cutoffs, initial conditions (SoC/SoH/temperature ranges with distributions), thermal parameters, and failure definitions (impedance_spike_early/mid, random_impedance_degradation, plus a no-failure baseline). Total assets = profiles × faults × multiplier. For each combo it produces `datasets/asset_<profile>_<fault>_NNN_data.csv` (sensor + `anomaly_status` column), a JSON metadata file, raw timeseries, and a global `doe_matrix_summary.json` — plus interactive Plotly HTML plots highlighting anomalous periods.

## Tech
The simulation loop is a while-loop with adaptive `update_time_step`, matching the rtbm-clone reference. `utils/anomaly_utils.check_and_apply_anomalies` patches battery state mid-run to inject impedance spikes or stochastic degradation; `utils/doe_config.DoEConfiguration` parses `doe.json` and expands the matrix; `utils/simspec_generator` and `altergo_sdk.utils.blueprints.simspec` (`parse_simspec`, `calculate_cascade`, `extend_from_simspec`) build the battery model from datasheet JSON without needing a live asset. `utils/dataset_generator` writes per-asset and summary files; `utils/asset_service.AssetService` optionally uploads synthesized assets back to Altergo. Sensor capture uses `Sensor` / `dataframeFromSensors` with `significantAppend` to keep file sizes bounded. Reproducible via configurable `random_seed`.

## Status
Active 2026-01, the largest of the five repos (~170 kB code). Generates training corpora for the platform's ML models — degradation, anomaly detection, future SoH variants — by producing labelled fault-vs-baseline pairs that would otherwise require months of field data. Contributor role — Alexandre is the primary author of the matrix DoE design, the anomaly injection layer, and the dataset writer.
