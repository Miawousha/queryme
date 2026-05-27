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
