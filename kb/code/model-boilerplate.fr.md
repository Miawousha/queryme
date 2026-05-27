---
name: "model_boilerplate"
url: https://github.com/ION-Altergo/model_boilerplate
role: contributor
visibility: private
description: "Scaffold de référence pour construire des modèles batterie jumeau numérique sur le SDK Altergo."
year: 2025
last_active: "2025-12"
language: "Python"
code_bytes: 69319
archived: false
tags: [battery, python, library]
---

model_boilerplate est le scaffold Python canonique pour construire des modèles batterie jumeau numérique sur la plateforme Altergo. Encapsule le cycle de vie `AltergoModelBoilerplate` du SDK (préparation des données, exécution, dashboards de debug, upload des sorties) dans une paire `entrypoint_simple.py` / `entrypoint_advanced.py`, avec un pattern de registre `models/` (classes enregistrées par décorateur plus manifest `model.json` par modèle) et quatre exemples travaillés — `eq_cycles`, `adv_eq_cycles`, `soc_eq_cycles`, `rainflow_cycles`. Fondation interne que les nouveaux modèles (SoC, SoH, impédance, déséquilibre cellules, etc.) forkent au lieu de recréer la plomberie SDK.

## What
Les entrées sont un asset Altergo et une liste de séries capteurs déclarées en JSON (courant, tension, température, SoC) ; les sorties sont de nouvelles séries temporelles capteurs ré-uploadées sur le même asset. `altergo-settings.json` choisit quels modèles tournent (`enabled_models`), comment les données sont récupérées (`compute_type`, `max_days_period_compute`), et s'il faut générer des dashboards Plotly de debug ou pousser les résultats. Consommé par les workers Altergo en production et par les auteurs de modèles localement via les credentials `dev-parameters.json`.

## Tech
`entrypoint_simple.py` tient en une ligne : `AltergoModelBoilerplate(extract_altergo_parameters()).execute()`. `entrypoint_advanced.py` éclate le cycle de vie en `prepare_models_data` / `execute_models` / `show_debug_dashboards` / `upload_models_output` pour que les auteurs puissent injecter des inputs custom entre les phases. Chaque modèle sous `models/<name>/` hérite de `altergo_sdk.boiler_plate.Model`, s'enregistre via `@register_model(name, metadata=...)`, déclare son contrat d'I/O dans `model.json`, et implémente `process(data) -> dict`. Les quatre exemples livrés couvrent des compteurs de cycles équivalents et un compteur rainflow — références concrètes pour les nouveaux contributeurs. Les tests vivent sous le dossier `tests/` de chaque modèle.

## Status
Scaffold de référence actif dans la flotte de modèles batterie ION-Altergo au 2025-12. Maintenu par l'équipe plateforme ; les repos de modèles individuels (rtbm, modèles clients custom) forkent tous ce layout. Rôle contributeur — Alexandre a étendu les modèles exemples et le pattern de registre en construisant rtbm et le générateur de datasets par-dessus.
