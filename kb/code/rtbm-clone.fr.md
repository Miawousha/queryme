---
name: "rtbm-clone"
url: https://github.com/ION-Altergo/rtbm-clone
role: contributor
visibility: private
description: "Workflow jumeau numérique — réplique un asset batterie réel et rejoue son profil via le simulateur lair."
year: 2024
last_active: "2024-10"
language: "Python"
code_bytes: 24389
archived: false
tags: [battery, python, simulation]
---

rtbm-clone est la fonction Altergo qui maintient un asset "clone" jumeau numérique pour une batterie réelle. `main.py` récupère l'asset source via le SDK Altergo, construit son modèle lair `Battery` avec `BatteryArchitectureBuilder`, get-or-create un asset clone associé, charge et interpole les datasets récents puissance/température/SoC de la source, puis exécute `rtbm_clone.sim_setup.run_sim` contre le moteur de simulation lair (`GlobalSettings` / `ScenarioSettings` / `SimulationStepSettings`) avant de réécrire les capteurs simulés stack et battery via `process_simulation_results`. Pas une copie du boilerplate — un workflow de production distinct.
