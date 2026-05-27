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

## What

Harnais de benchmark mono-usage pour le chemin d'ingestion de la plateforme Altergo. Balaye une grille 10 × 4 × 4 de configurations (nombre de jumeaux, nombre de pas, intervalle d'échantillonnage) — 160 runs en mode par défaut — et pour chacune nettoie le workspace, instancie les blueprints, instancie les jumeaux, génère des données capteurs aléatoires, les pousse via le SDK et enregistre la mesure. La sortie est un CSV plat qu'on peut tracer pour voir comment la latence d'ingestion évolue avec la taille du payload et la cardinalité des assets.

## Tech

Python pur au-dessus du SDK Altergo (`altergoClient.sendSensorDataToAssets`, instanciation par templates de blueprints). Le driver dans `benchmark/main.py` utilise `importlib.reload` sur quatre modules d'étapes (`step_00_cleanup` → `step_03_simulate_data_and_send`) dans une boucle imbriquée, en pilotant les configurations par variables d'environnement (`DIGITAL_TWIN_NUMBER`, `TIME_STEP_IN_MILLISECONDS`, `STEP_NUMBER`). Chaque run instrumente les deux côtés du fil — temps backend rapportés (download/processing/ingestion, extraits de la réponse SDK) et durées mesurées côté client (processing/zipping/uploading) — donc on peut reconstituer depuis le seul CSV la répartition entre coût de compression client et coût d'écriture serveur.

## Status

Outil one-shot de platform-engineering fin 2024 ; pas un produit pérenne. Les CSV de sortie ont alimenté les décisions de capacity planning du chemin d'écriture Altergo. Environ 20 Ko de code, sans README ni tests — le script tient lieu de spécification. Écrit en contributeur dans ION-Altergo.
