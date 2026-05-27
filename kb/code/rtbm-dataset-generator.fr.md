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
