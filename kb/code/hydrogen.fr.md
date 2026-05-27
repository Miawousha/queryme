---
name: "hydrogen"
url: https://github.com/ION-Altergo/hydrogen
role: contributor
visibility: private
description: "Simulation pas-à-pas d'usine hydrogène solaire+batterie+électrolyseur comparant un modèle batterie legacy à la batterie multi-échelle Lair."
year: 2025
last_active: "2025-03"
language: "Python"
code_bytes: 356501
archived: false
tags: [energy, battery, python, simulation]
---

hydrogen est une simulation Python d'une usine hydrogène vert couplée au solaire : un `HydrogenPlantSimulation` fait avancer pas à pas un `SolarPlant`, un `Electrolyzer` (limites de rampe, seuils d'activation/désactivation, rendement kg-H₂/kWh), une `Battery`, des charges auxiliaires statiques et un dispatcher `EMS` ligne par ligne sur un profil de puissance ou d'irradiance. `main.py` tourne en trois modes — `-legacy` (classe Battery simple), `-lair` (un `BatteryArchitectureBuilder` construit à partir d'un vrai blueprint Altergo, résolu cellule/module/stack), ou `-both` en parallèle pour comparaison — l'étage PV étant optionnellement piloté par `pvmodel.new_pv_power_generation` contre des bases CEC modules/onduleurs tirées d'Altergo. Outil R&D pour confronter le modèle batterie legacy à la batterie Lair électrochimiquement résolue sur des scénarios solaire+H₂ identiques.

## What
L'entrée est un dataset CSV (référencé par `power_profile_dataset_id` dans la config plateforme) — soit un profil de puissance précalculé, soit des données brutes d'irradiance/météo converties en puissance via `run_pv_simulation` contre des bases CEC modules + onduleurs. Le modèle de l'usine câble SolarPlant + Electrolyzer + Battery + AirCooledCondenser + deux StaticLoad (`auxPlantLoads`, aux minimal électrolyseur) à travers un dispatcher EMS ; pour chaque pas de temps, l'EMS décide des flux selon les contraintes de rampe, les seuils d'activation/désactivation et l'état batterie. Produit un `simulationDf` de toutes les variables par pas, un tableau de KPI, et optionnellement une page HTML statique ; quand `UPLOAD = True`, les résultats sont repoussés dans Altergo comme nouvel asset avec ses dashboards. La branche Lair fait tourner une batterie électrochimiquement résolue (cellule → module → stack), la branche legacy une Battery SOC simple — le mode `-both` les exécute sur les mêmes entrées pour comparer les trajectoires SOC/tension.

## Tech
Le cœur vit dans `balanced_simulation/` : `SolarPlant.py`, `Electrolyzer.py` (limites de rampe, activation/désactivation, rendements de production H₂ de base + fractionnel, conversion kg-H₂/kWh), `Battery.py` (legacy lumped), `EMS.py`, `EnergySystem.py`, et `HydrogenPlanSimulation.py` qui les compose. La branche Lair utilise `lair.components.battery_iq.battery_architecture_builder.BatteryArchitectureBuilder` contre un blueprint « Test Battery » récupéré sur Altergo, produisant une `Battery` de `Cell` / `ElectroChemEntity` résolue à `LEVEL_MODULE` / `LEVEL_STACK`. La modélisation PV vit dans `pvmodel/new_pv_power_generation.py`, alimentée par des datasets CEC modules et onduleurs tirés via URLs de téléchargement Altergo. `pyinstrument` est câblé (en commentaire) pour profiler les runs Lair, le modèle cellule-résolu étant nettement plus lent que le legacy. Les sous-dossiers parallèles `demo_simulation/`, `realtime_h2_model/` et `pvmodel/` contiennent des variantes apparentées et un entrypoint temps réel déployable.

## Status
Construit en 2024–2025, dernière activité mars 2025. Outil R&D / validation — pas un modèle client-facing. Utilisé pour valider la batterie multi-échelle Lair sur un scénario solaire+H₂ représentatif avant publication pour déploiements clients ; la comparaison legacy/lair est le contrôle principal. 356 ko de Python ; `UPLOAD` est par défaut à false pour exécuter le script hors-ligne contre un vrai blueprint Altergo sans polluer les données plateforme.
