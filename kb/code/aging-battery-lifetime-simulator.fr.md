---
name: "aging_battery_lifetime_simulator"
url: https://github.com/ION-Altergo/aging_battery_lifetime_simulator
role: contributor
visibility: private
description: "Simulateur de cycle de vie qui vieillit une Battery `lair` sous profils de puissance et d'ambiance, encadré par une machine à états de sécurité."
year: 2025
last_active: "2025-06"
language: "Python"
code_bytes: 89650
archived: false
tags: [battery, energy, python, simulation]
---

aging_battery_lifetime_simulator pilote une Battery électrochimique issue de la librairie interne `lair` (hiérarchie Cell / Stack / ElectroChemEntity avec un modèle de SoH attaché) à travers un profil de puissance et de température ambiante pour projeter le vieillissement du pack. La boucle principale dans `lifecycle_simulation.py` interpole la charge, fait tourner `batteryStateMachine` pour gérer le taper de charge (5 % avant le SoC max), les coupures thermiques à 55 °C avec hystérésis de 10 °C, et les arrêts haute/basse tension, puis avance chaque élément via `calculateNextStep(dt, T_amb)` sur un pas de temps adaptatif fourni par `altergo_sdk.tools.sim.update_time_step`. Les séries de SoC, SoH, vieillissement calendaire et cyclique, cycles équivalents, tension, courant et température sont enregistrées par des `Sensor` à seuil de variance, avec des seuils resserrés sur les 24 h initiales et finales — les "record days" — pour des frontières haute résolution.
