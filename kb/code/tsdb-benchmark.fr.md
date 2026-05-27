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

## What
La forme de la charge est fixée par la plateforme : beaucoup de capteurs (cardinalité en milliers), chacun émettant une valeur numérique à la seconde ou plus vite, ingérés en continu par des edge devices et requêtés pour les dashboards. Le benchmark pilote chaque moteur candidat sur le même schéma `(sensorId, timestamp, value)`, affiche les rows/sec en glissant, et laisse l'opérateur scaler via `multi_device_launcher.py` à N processus d'écriture parallèles — chacun possédant une plage d'IDs disjointe — pour trouver où chaque moteur commence à saturer. Les vérifications côté lecture passent par le conteneur Metabase contre les tables live.

## Tech
QuestDB écrit via `questdb.ingress.Sender` avec `SYMBOL CAPACITY 131072 NOCACHE` pour `sensorId` et `PARTITION BY DAY WAL` ; ClickHouse utilise un `MergeTree` avec `ORDER BY (sensorId, timestamp)` partitionné par jour, alimenté par `clickhouse-batch-ingestion.py` via le client HTTP ; TimescaleDB utilise une variante hypertable dans le flux `timescaledb-infinite-flow-real-mono.py`. Cardinalité et taille de batch sont réglées par script (défaut 100 capteurs à 1 Hz) ; le launcher passe `START_SENSOR_ID`, `CARDINALITY`, `BATCH_SIZE` via env et redirige les logs par device dans `logs/device_N.log`. `docker/{questdb,clickhouse,timescaldedb,metabase}.yaml` donnent des stacks en une commande ; `data_explorer_app/` est un petit lecteur Python pour les résultats ; `requirements.txt` épingle les SDK.

## Status
Dernière activité septembre 2025, dépôt GitHub privé sur l'organisation ION-Altergo. Utilisé en interne pour étayer le choix de la base time-series de la plateforme Altergo ; aucun compte-rendu formel dans le dépôt. Le README laisse fuir des PAT GitHub `ghp_…` dans les URLs de clone — à révoquer.
