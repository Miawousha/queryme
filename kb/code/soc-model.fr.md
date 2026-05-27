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

## What
Job batch de rejeu : pour un asset cellule et une activité nommée, calcule le SoC sur cette fenêtre et le réécrit comme nouvelles séries capteurs pour que l'UI plateforme puisse les tracer à côté de la tension/courant mesurés. Lit `bp_sensors` (noms tension/courant/température), `bp_parameters` (capacité), et un JSON cell-model dans `bp_datasets` (table OCV, valeurs RC, exposant Peukert) depuis le blueprint ; émet cinq séries — `[Altergo] SoC`, `SoC Current High/Low`, `SoC Voltage High/Low` — plus une sortie de tâche "Visualize" cliquable qui deep-link dans la factory.

## Tech
L'`Estimator` porte les doubles `ocvH/ocvL`, `socIH/socIL` (bornes côté courant), `socVH/socVL` (bornes côté tension), et les comptages `ccH/ccL`. À chaque pas il appelle `countCoulomb(I, dt)` (facteur Peukert `(|I|/I_ref)^(n-1)` appliqué en décharge), `updateSOCI()` quand la charge accumulée dépasse `chargeAcceptanceAh*10`, puis `calculateNextOcvs(V, I, T=25°C)` qui soustrait la somme de trois chutes RC `vDyns[0..2]` de la tension borne pour retrouver l'OCV, applique un filtre médian, et lit le SoC dans la table OCV. La température est figée à 25°C — limitation connue que la nouvelle génération `soc` corrige. Piloté ligne par ligne par `df.apply` ; ré-échantillonnage en `cell_asset.df.resample('S').asfreq().ffill().bfill()` ; résultats renvoyés via `sendSensorDataToAssets(updateMethod=REPLACE)`.

## Status
Dernier commit 2024-10. Premier modèle SoC déployé sur Altergo ; a vécu sur des assets clients tout au long de 2024 avant d'être remplacé par `soc` (2025). Code archivé pour référence — le trafic production passe désormais par le successeur basé sur le boilerplate.
