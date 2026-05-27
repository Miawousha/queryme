---
name: "altergo_platform_etl_benchmark"
url: https://github.com/ION-Altergo/altergo_platform_etl_benchmark
role: contributor
visibility: private
description: "Sensor-data ingestion benchmark for the Altergo platform — sweeps digital-twin count, step count and sampling rate."
year: 2024
last_active: "2024-11"
language: "Python"
code_bytes: 19873
archived: false
tags: [infra, python, data-only]
---

altergo_platform_etl_benchmark measures end-to-end sensor-data ingestion on the Altergo platform: write-side throughput, not query/read performance. `benchmark/main.py` sweeps a grid of digital-twin counts (10 → 100), step counts (1k → 1M) and sampling intervals (1 s → 30 min), generates random time series and pushes them through `altergoClient.sendSensorDataToAssets`. Each run logs the backend's reported download / processing / ingestion times alongside the client's processing / zipping / uploading times to `benchmark_results.csv`, so total points × cardinality can be regressed against latency. No README — the script and its CSV output are the spec.

## What

Single-purpose benchmark harness for the Altergo platform's ingestion path. Sweeps a 10 × 4 × 4 grid of (digital-twin count, step count, sampling interval) configurations — 160 runs in the default driver — and for each one cleans the workspace, instantiates blueprints, instantiates digital twins, generates random sensor data, pushes it through the SDK, and records timing. The output is a flat CSV that can be plotted to see how ingestion latency scales with payload size and asset cardinality.

## Tech

Pure Python over the Altergo SDK (`altergoClient.sendSensorDataToAssets`, blueprint-template instantiation). The driver in `benchmark/main.py` uses `importlib.reload` on four staged step modules (`step_00_cleanup` → `step_03_simulate_data_and_send`) inside a nested loop, driving configurations through environment variables (`DIGITAL_TWIN_NUMBER`, `TIME_STEP_IN_MILLISECONDS`, `STEP_NUMBER`). Each run instruments both sides of the wire — backend-reported download/processing/ingestion timings (parsed from the SDK response) and client-measured processing/zipping/uploading durations — so the breakdown between client-side compression cost and server-side write cost is recoverable from the CSV alone.

## Status

One-shot platform-engineering tool from late 2024; not a long-lived product. The CSV outputs fed into capacity-planning decisions for the Altergo write path. Roughly 20 KB of code, no README, no tests — the script is the spec. Authored as a contributor inside ION-Altergo.
