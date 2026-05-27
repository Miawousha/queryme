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
