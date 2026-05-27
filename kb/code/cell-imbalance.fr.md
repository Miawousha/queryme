---
name: "cell-imbalance"
url: https://github.com/ION-Altergo/cell-imbalance
role: contributor
visibility: private
description: "Indice de dispersion cellule/module et estimateur de tendance Rdc par événements, déployables via le SDK Altergo."
year: 2025
last_active: "2025-10"
language: "Python"
code_bytes: 18425
archived: false
tags: [battery, python]
---

cell-imbalance est un dépôt Python qui contient deux modèles batterie bâtis sur l'`AltergoModelBoilerplate` afin de s'exécuter en jobs jumeau-numérique déployables. `CellModuleImbalanceIndexModel` dérive un écart absolu en mV à partir des agrégats `voltage_min`/`max` des cellules, un pourcentage relatif à la moyenne, un indice de déséquilibre 0–1 mis à l'échelle d'un seuil d'alarme configurable avec un exposant de shaping, et une sortie tri-état OK/Warn/Alarm, avec une compensation de température optionnelle qui retranche `|TCV| * ΔT` du ΔV brut ; les entrées au niveau module sont traitées de la même manière quand présentes. `RdcTrendEstimator` détecte les marches de courant au-dessus d'un seuil, calcule les médianes de V et I dans des fenêtres pré/post autour de chaque marche, en dérive une résistance interne DC par événement `|ΔV|/|ΔI|`, filtre optionnellement les outliers par MAD, puis suit une tendance EWMA contre une baseline.

## What
Les entrées proviennent d'un jumeau numérique BMS en direct — agrégats min/max/moyenne de tension par cellule et par module, courant pack, et optionnellement températures cellule. Les sorties sont trois flux qu'un opérateur peut alerter et tendancer : un indice de dispersion plus état OK/Warn/Alarm pour cellules et modules (attrape les cellules faibles qui dérivent avant un trip), et une tendance Rdc événementielle contre baseline avec un pourcentage de dérive (attrape la croissance lente de résistance signe de vieillissement ou de dégradation de contact).

## Tech
`models/cell_imbalance/cell_imbalance.py` calcule ΔV depuis voltage_min/voltage_max, normalise en indice 0–1 mis à l'échelle d'`alarm_threshold_mv` avec un exposant de shaping, applique une compensation de température optionnelle `|TCV| * ΔT`, et duplique le pipeline au niveau module. `models/rdc_trend_estimator/rdc_trend_estimator.py` balaye la trace de courant pour des marches au-dessus d'un seuil configurable, prend les médianes de V et I dans des fenêtres pré et post séparées par une garde, divise pour obtenir une résistance DC par événement, filtre les outliers par MAD, puis maintient une EWMA contre une baseline et rapporte un pourcentage de dérive. Tous deux héritent d'`AltergoModelBoilerplate` ; `entrypoint_simple.py` et `entrypoint_advanced.py` les enregistrent pour le déploiement SDK.

## Status
Dépôt interne de modèles jumeau-numérique Altergo, dernière activité 2025-10. Déployé contre des assets BESS en production pour remonter aux opérations les alarmes de dispersion cellule et les tendances de vieillissement Rdc.
