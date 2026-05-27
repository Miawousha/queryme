---
name: "battery_usage_analyzer"
url: https://github.com/ION-Altergo/battery_usage_analyzer
role: contributor
visibility: public
description: "Modèle de segmentation multi-couches qui étiquette les modes opératoires batterie, les points de rupture et les phases CC/CV à partir de séries temporelles."
year: 2025
last_active: "2025-09"
language: "Python"
stars: 0
code_bytes: 61028
archived: false
tags: [battery, energy, python, library]
---

battery_usage_analyzer est l'emplacement canonique d'un modèle de segmentation multi-couches pour séries temporelles batterie, packagé au-dessus du framework `boiler_plate.Model` du SDK Altergo. À partir du courant, du SoC et des min/max de tension et température cellule, `BatteryUsageAnalyzer.process` émet une couche 0 de modes opératoires (charge / décharge / idle), une couche 1 de points de rupture pilotés par les données via un score de changement composé multi-signaux avec z-score robuste et contrainte de gap minimum, et une couche 2 de phases métier (repos, charge CC, charge CV, décharge) par étiquetage majoritaire par segment. Le dépôt suit le même gabarit en deux couches que le dépôt personnel `battery-digital-twin-models` (README, `entrypoint.py` et structure `models/` partagés), mais accueille un jeu de modèles différent — analyzer et `eq_cycles` ici, contre `eq_cycles` et `adv_eq_cycles` côté perso — donc le framework est partagé, la science ne l'est pas. Cette copie ION-Altergo est l'emplacement canonique pour l'usage analyzer.
