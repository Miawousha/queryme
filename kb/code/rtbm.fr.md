---
name: "rtbm"
url: https://github.com/ION-Altergo/rtbm
role: contributor
visibility: private
description: "Real-Time Battery Model — simulateur BMS physique sur le SDK Altergo et le cœur lair battery_iq."
year: 2025
last_active: "2025-09"
language: "Python"
code_bytes: 32804
archived: false
tags: [battery, python, simulation]
---

rtbm (Real-Time Battery Model) est un modèle enregistré dans Altergo qui simule un système batterie pas à pas à partir de séries d'entrée de puissance, courant, température et SoC. `models/rtbm/rtbm.py` construit des objets Battery/Cell/Stack à partir d'un `simspec.json` via `lair.components.battery_iq`, exécute les transitions de `batteryStateMachine` avec checks de sécurité et logique de refroidissement, et renvoie tension, température, courant, SoC et puissance sous forme de pandas Series. `entrypoint.py` récupère l'asset depuis Altergo, dérive le simspec via `BatteryArchitectureBuilder`, et délègue l'exécution à `altergo_sdk.boiler_plate.execute_altergo_models`.

## What
Entrées : quatre séries temporelles sur un asset Altergo — `power`, `current`, `temperature`, `soc`. Sorties : cinq séries simulées — `voltage`, `temperature`, `current`, `soc`, `power` — ré-uploadées comme capteurs jumeau numérique sur le même asset. Le modèle existe pour que la plateforme produise des diagnostics attendu-vs-réel sur des flottes de batteries réelles : l'écart entre tension/SoC mesurés et simulés signale dégradation, anomalies ou défauts capteur. Consommé par les workers Altergo ; une exécution par asset par fenêtre planifiée.

## Tech
`Rtbm` hérite de la classe `Model` du SDK et s'enregistre via `@register_model("rtbm", metadata={category: "Performance", complexity: "Simple", computational_cost: "Low"})`. La boucle de simulation vient de `lair.components.battery_iq.clone.batteryStateMachine` — pas de temps adaptatif piloté par `update_time_step`, logique de refroidissement, cutoffs de sécurité thermique, mode sim depth-1 (`SIM_TARGETED_DEPTH = 1`, granularité stack). `BatteryArchitectureBuilder` parcourt la hiérarchie blueprint de l'asset pour construire la `Battery` lair de `Stack`s de `Cell`s et émettre un `simspec.json`. Les capteurs de sortie sont agrégés via `dataframeFromSensors`. Dashboards Plotly de debug disponibles quand `debug_mode` est actif.

## Status
Actif en 2025 comme point de départ canonique pour les nouveaux modèles batterie sur Altergo — les modèles client plus récents (impédance, SoH, déséquilibre cellules) forkent ce layout. Dernière activité 2025-09. Rôle contributeur — Alexandre possède le code du modèle rtbm et le wiring de l'entrypoint ; l'équipe plateforme maintient le SDK et lair sous-jacents.
