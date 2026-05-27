---
name: "impedance"
url: https://github.com/ION-Altergo/impedance
role: contributor
visibility: private
description: "Estimateur événementiel de résistance interne DC (Rdc) avec tendance EWMA et dérive en pourcentage vs baseline."
year: 2025
last_active: "2025-10"
language: "Python"
code_bytes: 12129
archived: false
tags: [battery, python]
---

impedance est un modèle de santé batterie qui estime la résistance interne DC à partir d'événements de saut de courant — pas un ajusteur de spectre EIS, malgré le nom du dépôt. `RdcTrendEstimator` dans `models/rdc_trend_estimator/` détecte les sauts bruts de courant au-dessus de `di_threshold_abs`, prend la médiane de V et I dans des fenêtres pré/post avec une bande de garde autour de chaque marche, calcule `Rdc = |ΔV|/|ΔI|`, rejette les valeurs aberrantes via z-score MAD, et émet une série Rdc par événement plus une tendance EWMA et un pourcentage de changement par rapport à une baseline configurable. Bâti sur le model boilerplate Altergo (`AltergoModelBoilerplate` pilote l'entrypoint), donc le modèle se déploie contre des assets jumeaux en production avec la plomberie SDK gérée par le framework.

## What
Les entrées sont des pandas Series UTC alignées pour `current` (A) et `voltage` (V), plus une `temperature` (C) optionnelle et un scalaire `baseline_rdc` (Ω). Le validateur refuse toute entrée désalignée, non-monotone ou vide — aucun ré-échantillonnage implicite. La détection utilise la première différence brute (`cur.diff().abs() >= di_threshold_abs`, défaut 10 A) ; pour chaque marche à `t*`, les médianes pré/post viennent de `[t*-guard-pre, t*-guard)` et `[t*+guard, t*+guard+post)` (défauts 60 s / 60 s / 60 s), donnant `Rdc_event = |ΔV| / |ΔI|`. Trois séries sont émises aux timestamps d'événements : `rdc` brut, `rdc_trend` (EWMA sur `ewma_span_events`, défaut 10), et `rdc_change_pct` vs baseline (initialisée depuis les `baseline_first_n` premiers événements ou un scalaire fourni en config). Un z-score robuste MAD (`outlier_sigma`, défaut 3,0) écarte les outliers quand `drop_outliers` est actif.

## Tech
Sous-classe `altergo_sdk.boiler_plate.Model`, déclarée dans `models/rdc_trend_estimator/model.json` (I/O logiques) et câblée dans `altergo-settings.json` (noms de capteurs plateforme : `Current` / `Maximum Voltage` / `Temperature` → `RDC Trend/DC Internal Resistance` + `RDC Trend/Rdc Trend` + `RDC Trend/Rdc Change %`). Le dépôt embarque un registre multi-modèles (`enabled_models = "eq_cycles,adv_eq_cycles,soc_eq_cycles,rainflow_cycles,rdc_trend_estimator"`), mais seul `rdc_trend_estimator` y est implémenté. Deux entrypoints — `entrypoint_simple.py` appelle `boilerplate.execute()` une fois pour le chemin auto, `entrypoint_advanced.py` expose les quatre phases (prepare → execute → debug → upload) pour les pré/post-traitements personnalisés. Les valeurs par défaut vivent dans `model.json` ; `compute_type` supporte `incremental` / `full` / `manual` avec `max_days_period_compute` pour plafonner chaque run.

## Status
Actif en 2025, dernière retouche en octobre. Modèle de qualité production — se déploie contre des jumeaux numériques batterie Altergo en production, calcule les tendances Rdc en incrémental, peut pousser les résultats vers les dashboards plateforme. Le pattern boilerplate ici (`AltergoModelBoilerplate` qui pilote tout) est le template Altergo moderne ; le dépôt `effective-capacity-benchmark-model` est un scaffold mono-modèle plus ancien qui n'a pas franchi cette génération.
