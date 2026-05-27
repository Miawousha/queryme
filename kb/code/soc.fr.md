---
name: "soc"
url: https://github.com/ION-Altergo/soc
role: contributor
visibility: private
description: "Estimateur SoC à double borne — comptage coulombique + table OCV avec Peukert et dynamique multi-RC."
year: 2025
last_active: "2025-10"
language: "Python"
code_bytes: 231835
archived: false
tags: [battery, python, simulation]
---

soc est l'estimateur State-of-Charge actuel de la plateforme jumeau numérique Altergo — un algorithme à double borne qui fait tourner en parallèle un comptage coulombique et une lecture de table OCV avant de les fusionner, avec des marges d'erreur asymétriques pour qu'à chaque pas il émette un SoC et son intervalle d'incertitude. Bâti sur le scaffold model-boilerplate (`register_model("soc")`) ; le cœur gère compensation Peukert en décharge, modèle de tension dynamique multi-RC avec constantes de temps compensées en température, filtrage médian + passe-bas de l'OCV, contraintes directionnelles, détection de repos, et capacité effective mise à l'échelle par le SoH. Remplace `soc-model` (2024) ; livre aussi une variante historical-SoC pour le rejeu itératif sur données passées en plus de l'estimateur temps réel.

## What
Le modèle `soc` temps réel consomme des séries `voltage`/`current`/`temperature` plus un blob `battery_config` (table OCV(SoC,T), valeurs RC, exposant Peukert) et une série `soh` optionnelle ; il émet un `soc` principal, une largeur d'incertitude `soc_bounds`, l'`ocv_estimated` reconstruit, et quatre bornes de debug (`soc_coulomb_high/low`, `soc_ocv_high/low`). La variante `historical_soc` dans le même dépôt résout un autre problème : détecter des "ancres" de repos de qualité (`|I|` petit et `|dV/dt|` petit pendant ≥N minutes), mapper la tension de chaque ancre à un SoC via des courbes OCV validées en laboratoire, puis ajuster la capacité effective entre ancres consécutives pour que le comptage coulombique tombe pile sur les deux SoC d'ancres — un RANSAC fusionne les capacités par paire d'ancres en une série continue `C_eff(t)` et un SoH, avec la règle explicite que les courbes OCV viennent du labo, jamais apprises sur le terrain, pour éviter la dérive circulaire.

## Tech
Deux modèles cohabitent : `models/soc/soc.py` (`SOCEstimator(Model)`, ~1500 lignes) et `models/historical_soc/historical_soc.py` (`HistoricalSOCEstimator`, basé ancres avec `sklearn.linear_model.RANSACRegressor`). L'estimateur temps réel maintient des compteurs coulombiques high/low séparés avec erreurs courant asymétriques (`I*(1±rel_err) ± abs_err`), n'applique Peukert que si `|I|` dépasse un seuil de repos, fait tourner une pile RC `V_terminal = OCV - R0*I - Σ V_RCᵢ` où chaque `V_RCᵢ` décroît en `exp(-Δt/τᵢ)` recalculé à chaque pas, filtre l'OCV reconstruit avec une médiane sur 16 échantillons, puis applique un passe-bas et lit le SoC dans une table OCV(SoC,T) bilinéaire avec sélection charge/décharge par hystérésis. Les mises à jour sont gatées : comptage continu, recalcul SoC complet seulement quand la charge accumulée dépasse `soc_update_threshold` (0,1% de capacité) ou que `max_soc_update_interval` (60 s) s'écoule ou qu'un repos est détecté (`|I| < 0,05 A` pendant ≥30 min). La config retombe des paramètres blueprint `BP/OCV_LookupTable` / `BP/Cell_Config` vers le `battery_config.json` local. L'entrypoint est une coquille de 45 lignes qui appelle `execute_altergo_models(altergo_arguments)` depuis `altergo_sdk.boiler_plate` — toute la plomberie plateforme (résolution des entrées, décimation des sorties, remontée d'erreurs) est centralisée dans le SDK.

## Status
Modèle en production depuis 2025 ; version 1.0 actuellement sur la plateforme. Vit dans `/models/soc/` (temps réel, recalibration par OCV) et `/models/historical_soc/` (rejeu offline par ancres avec trois variantes : `historical_soc.py`, `_iterative.py`, `_simple.py`). Le dépôt embarque ~230 kB de code plus datasets de calibration, scripts de debug (`debug_anchors.py`, `debug_historical_soc.py`, `debug_iterative_fitting.py`), sorties de tests d'auto-décharge (`self_discharge_factors.png`), et un `model_creation_guide.md`. Précision annoncée ±2–5% SoC en conditions normales, avec `soc_bounds` exposant la confiance temps réel aux consommateurs en aval. Dernier commit 2025-10.
