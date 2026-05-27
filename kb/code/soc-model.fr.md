---
name: "soc-model"
url: https://github.com/ION-Altergo/soc-model
role: contributor
visibility: private
description: "Estimateur SoC de première génération (2024) — un script coulomb + OCV à double borne, remplacé par soc."
year: 2024
last_active: "2024-10"
language: "Python"
code_bytes: 24447
archived: false
tags: [battery, python, shelved]
---

soc-model est l'estimateur State-of-Charge de première génération (2024) pour la plateforme Altergo — une seule classe `Estimator` (`estimator/soc_estimator.py`) qui implémente la même idée double-borne comptage coulombique + lecture OCV, avec Peukert en décharge, tension dynamique RC et OCV filtré médian. L'entrypoint récupère tension/courant/température sur la fenêtre d'une activité via le SDK Altergo, ré-échantillonne à 1 Hz, exécute l'estimateur ligne par ligne et réécrit `SoC`, `SoC Voltage High` et `SoC Voltage Low`. Remplacé par `soc` (2025), qui est passé au scaffold model-boilerplate et a ajouté tau compensé en température, mise à l'échelle SoH et contraintes directionnelles sur l'OCV.
