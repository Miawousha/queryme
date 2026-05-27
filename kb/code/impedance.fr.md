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
