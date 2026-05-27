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

## What
Entrée : un asset batterie réel sur Altergo avec capteurs Current/Voltage/SoC/Temperature/Power/Ambient Temperature mesurés sur une fenêtre récente (par défaut 24h avant maintenant). Sortie : un asset clone séparé `RTBM-<source-sn>-DEMO`, fraîchement créé ou nettoyé à chaque run, peuplé de Voltage/Temperature simulés par stack plus les capteurs batterie agrégés. Le workflow existe pour que la plateforme publie un "jumeau parfait" à côté du vrai — tout ce que l'asset réel fait, le clone le rejoue à travers la physique, et les diagnostics aval les comparent.

## Tech
`get_or_create_clone_asset` gère le cycle de vie de l'asset : match par numéro de série, efface optionnellement les données ou supprime-et-recrée les assets-avec-enfants, puis assemble les stacks depuis l'interface `Stacks` du blueprint source. `prepare_simulation_data` charge les capteurs via `getAssetSensorData`, forward-fill, et passe par `interpolateValue`. La config runtime de simulation vient de `configurationValues.globalSettings` / `simulationSteps` / `runTimeSettings` mappés vers les lair `GlobalSettings` / `SimulationStepSettings` / `ScenarioSettings` par `lair_override.py`. `sim_setup.run_sim` pilote `lair.components.battery_iq.clone.run_clone_simulation`. `simulation_output.process_simulation_results` éclate le dataframe de sortie multi-stacks (`Voltage|0`, `Temperature|0`, ...) par asset enfant et pousse via `dataUpdateMethod`.

## Status
Workflow de production livré comme fonction Altergo en 2024, démontré sur l'asset Rikuti (`RK-WIT-001`). Dernière activité 2024-10 ; précède le pattern de registre model-boilerplate. Rôle contributeur — Alexandre possède `sim_setup.py`, `simulation_output.py`, `lair_override.py` et la gestion du cycle de vie d'asset. Référence architecturale pour les workflows un-asset-par-défaut ultérieurs comme rtbm-dataset-generator.
