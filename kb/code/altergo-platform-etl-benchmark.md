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
