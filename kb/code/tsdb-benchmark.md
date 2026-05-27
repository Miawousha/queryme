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

## What
The shape of the workload is fixed by the platform: many sensors (cardinality in the thousands), each emitting a numeric value every second or faster, ingested continuously by edge devices and queried back for dashboards. The benchmark drives each candidate engine with the same `(sensorId, timestamp, value)` schema, prints rolling rows/sec, and lets the operator scale up `multi_device_launcher.py` to N parallel writer processes — each owning a disjoint sensor-ID range — to find where each engine starts to choke. Read-side spot checks use the Metabase container against the live tables.

## Tech
QuestDB writes go through `questdb.ingress.Sender` with `SYMBOL CAPACITY 131072 NOCACHE` for `sensorId` and `PARTITION BY DAY WAL`; ClickHouse uses a `MergeTree` with `ORDER BY (sensorId, timestamp)` partitioned by day, fed by `clickhouse-batch-ingestion.py` over the HTTP client; TimescaleDB uses a hypertable variant in the `timescaledb-infinite-flow-real-mono.py` flow. Cardinality and batch size are set per script (default 100 sensors at 1 Hz); the launcher passes `START_SENSOR_ID`, `CARDINALITY`, `BATCH_SIZE` via env and tees per-device logs into `logs/device_N.log`. `docker/{questdb,clickhouse,timescaldedb,metabase}.yaml` give one-command stacks; `data_explorer_app/` is a small Python reader for results; `requirements.txt` pins the SDKs.

## Status
Last active September 2025, private GitHub repo on the ION-Altergo org. Used internally to back the time-series DB choice for the Altergo platform; no formal write-up in the repo itself. The README leaks `ghp_…` GitHub PATs in clone URLs — these need to be revoked.
