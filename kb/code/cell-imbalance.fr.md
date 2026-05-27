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
