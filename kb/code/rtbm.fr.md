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
