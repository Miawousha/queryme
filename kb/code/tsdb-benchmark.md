---
name: "tsdb-benchmark"
url: https://github.com/ION-Altergo/tsdb-benchmark
role: contributor
visibility: private
description: "Time-series DB shootout — QuestDB, ClickHouse, TimescaleDB on simulated edge-device sensor ingest."
year: 2025
last_active: "2025-09"
language: "Python"
code_bytes: 59664
archived: false
tags: [infra, data-only, python]
---

tsdb-benchmark is the due-diligence repo that compared QuestDB, ClickHouse, and TimescaleDB for the Altergo platform's sensor ingest workload. The actual work is in `benchmark/`: per-database ingestion scripts (`questdb-infinite-flow-real-mono.py`, `clickhouse-batch-ingestion.py`, `timescaledb-infinite-flow-real-mono.py`) push synthetic sensor rows in tight loops while measuring rows/sec, alongside a `multi_device_launcher.py` that spawns N edge-device processes against split sensor-ID ranges. Each engine has a `docker/*.yaml` for a one-command bring-up, Metabase included; a Streamlit-style `data_explorer_app/` reads results back out. Results aren't written up in the repo — the README is shell snippets and (notably) leaked GitHub PAT tokens that should be revoked.
