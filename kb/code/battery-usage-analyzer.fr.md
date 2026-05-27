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

## What

Transforme la télémétrie batterie brute (courant, SoC, extrêmes cellule de tension et température) en une timeline étiquetée — dans quel mode la batterie était à chaque instant, où son comportement a changé, et à quelle phase CC/CV/repos chaque segment appartient. Les analytics en aval (comptage de cycles, modèles de dégradation, dashboards) consomment ces étiquettes plutôt que de re-parser les signaux bruts, ce qui centralise la science.

## Tech

Bâti sur le framework `boiler_plate.Model` du SDK Altergo — `@register_model("battery_usage_analyzer")` expose la classe, `model.json` porte le manifeste, et `entrypoint.py` délègue à `execute_altergo_models`. La couche 0 est règle-based sur courant signé et delta SoC. La couche 1 calcule des dérivées par seconde sur `current`, `soc`, `v_cell_min`/`v_cell_max`, `t_cell_min`/`t_cell_max`, les lisse en EWM, applique un z-score robuste (median/MAD) via `robust_z`, compose un score de changement multi-signaux via `compose_change_score`, sélectionne les pics au-dessus d'un seuil avec `detect_peaks_over_threshold`, et impose un gap minimum via `enforce_min_gap`. La couche 2 prend les frontières de la couche 1 et attribue la phase dominante par segment via `majority_label_per_segment`. Le dépôt partage README, `entrypoint.py` et l'arborescence `models/` avec le dépôt personnel `battery-digital-twin-models` — un cousin par gabarit, pas un fork — mais chacun héberge un jeu de modèles distinct.

## Status

Emplacement canonique côté ION-Altergo pour l'usage analyzer (le dépôt personnel `battery-digital-twin-models` porte plutôt `eq_cycles` et `adv_eq_cycles`). Actif en 2025 (dernière activité septembre 2025), visibilité publique dans l'org ION-Altergo. Livré avec un `run_tests.py`, un README spécifique au modèle, un `MODEL_CREATION_GUIDE.md` qui documente comment ajouter un nouveau modèle au framework, et un dossier `documentation/`. Les étiquettes émises sont consommées par d'autres modèles de la chaîne d'outils batterie Altergo.
