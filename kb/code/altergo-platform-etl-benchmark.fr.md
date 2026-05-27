---
name: "altergo_platform_etl_benchmark"
url: https://github.com/ION-Altergo/altergo_platform_etl_benchmark
role: contributor
visibility: private
description: "Benchmark d'ingestion de données capteurs sur la plateforme Altergo — balaye nombre de jumeaux, de pas et fréquence d'échantillonnage."
year: 2024
last_active: "2024-11"
language: "Python"
code_bytes: 19873
archived: false
tags: [infra, python, data-only]
---

altergo_platform_etl_benchmark mesure l'ingestion bout-en-bout des données capteurs sur la plateforme Altergo : le débit en écriture, pas la lecture. `benchmark/main.py` balaye une grille de nombres de jumeaux numériques (10 → 100), de nombres de pas (1k → 1M) et d'intervalles d'échantillonnage (1 s → 30 min), génère des séries temporelles aléatoires et les pousse via `altergoClient.sendSensorDataToAssets`. Chaque exécution journalise les temps backend rapportés (download / processing / ingestion) à côté des temps client (processing / zipping / uploading) dans `benchmark_results.csv`, ce qui permet de régresser la latence en fonction du volume × cardinalité. Pas de README — le script et son CSV de sortie tiennent lieu de spécification.
