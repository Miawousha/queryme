---
name: "rtbm_dataset_generator"
url: https://github.com/ION-Altergo/rtbm_dataset_generator
role: contributor
visibility: private
description: "Framework DoE matriciel pour générer des jeux de données simulés de batterie avec profils de défauts contrôlés."
year: 2026
last_active: "2026-01"
language: "Python"
code_bytes: 169798
archived: false
tags: [battery, python, simulation, data-only]
---

rtbm_dataset_generator est un framework de Design-of-Experiment matriciel pour synthétiser des jeux de données d'entraînement batterie. `main_matrix.py` parcourt le produit cartésien profils de puissance × scénarios de défaut (un asset par combinaison profil-défaut, plus des baselines), charge-et-étend chaque profil CSV à une durée cible, construit la `Battery` lair depuis un simspec via `BatteryArchitectureBuilder`, exécute la simulation via `batteryStateMachine` avec `check_and_apply_anomalies` injectant des défauts contrôlés (pics d'impédance, etc.), et écrit des datasets parquet + JSON par asset plus un résumé DoE. Bâti sur `altergo_sdk` et `lair.components.battery_iq` ; alimente les données d'entraînement du modèle batterie temps réel.

## What
Piloté par `doe.json` : liste de profils de puissance (fichiers CSV indexés par timestamp), spécifications batterie (chemins de simspec, noms de blueprints), cutoffs de simulation, conditions initiales (plages SoC/SoH/température avec distributions), paramètres thermiques, et définitions de défauts (impedance_spike_early/mid, random_impedance_degradation, plus une baseline sans défaut). Total assets = profils × défauts × multiplicateur. Pour chaque combo, il produit `datasets/asset_<profile>_<fault>_NNN_data.csv` (capteurs + colonne `anomaly_status`), un fichier JSON de métadonnées, les timeseries brutes, et un `doe_matrix_summary.json` global — plus des plots HTML Plotly interactifs surlignant les périodes anormales.

## Tech
La boucle de simulation est un while-loop avec `update_time_step` adaptatif, alignée sur la référence rtbm-clone. `utils/anomaly_utils.check_and_apply_anomalies` patche l'état de la batterie en cours de run pour injecter des pics d'impédance ou de la dégradation stochastique ; `utils/doe_config.DoEConfiguration` parse `doe.json` et déploie la matrice ; `utils/simspec_generator` et `altergo_sdk.utils.blueprints.simspec` (`parse_simspec`, `calculate_cascade`, `extend_from_simspec`) construisent le modèle batterie depuis le JSON datasheet sans avoir besoin d'un asset live. `utils/dataset_generator` écrit les fichiers par asset et le résumé ; `utils/asset_service.AssetService` upload optionnellement les assets synthétisés vers Altergo. La capture de capteurs utilise `Sensor` / `dataframeFromSensors` avec `significantAppend` pour borner la taille des fichiers. Reproductible via `random_seed` configurable.

## Status
Actif en 2026-01, le plus gros des cinq repos (~170 kB de code). Génère les corpus d'entraînement pour les modèles ML de la plateforme — dégradation, détection d'anomalies, futures variantes SoH — en produisant des paires défaut-vs-baseline étiquetées qui demanderaient sinon des mois de données terrain. Rôle contributeur — Alexandre est l'auteur principal du design DoE matriciel, de la couche d'injection d'anomalies et du writer de datasets.
