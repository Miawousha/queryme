---
name: "tsdb-benchmark"
url: https://github.com/ION-Altergo/tsdb-benchmark
role: contributor
visibility: private
description: "Comparatif de bases time-series — QuestDB, ClickHouse, TimescaleDB sur ingestion capteur simulée."
year: 2025
last_active: "2025-09"
language: "Python"
code_bytes: 59664
archived: false
tags: [infra, data-only, python]
---

tsdb-benchmark est le dépôt de due diligence ayant comparé QuestDB, ClickHouse et TimescaleDB pour la charge d'ingestion capteur de la plateforme Altergo. Le vrai travail vit dans `benchmark/` : scripts d'ingestion par moteur (`questdb-infinite-flow-real-mono.py`, `clickhouse-batch-ingestion.py`, `timescaledb-infinite-flow-real-mono.py`) qui poussent des lignes capteur synthétiques en boucle serrée en mesurant les rows/sec, accompagnés d'un `multi_device_launcher.py` qui lance N processus d'edge devices sur des plages d'identifiants disjointes. Chaque moteur a un `docker/*.yaml` pour un démarrage en une commande, Metabase compris ; un `data_explorer_app/` façon Streamlit relit les résultats. Aucun compte-rendu de résultats dans le dépôt — le README se résume à des snippets shell et (à noter) à des tokens GitHub PAT exposés à révoquer.
