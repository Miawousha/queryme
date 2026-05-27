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

## What

Prend un profil d'usage (séries temporelles de puissance demandée + température ambiante, fourni en dataset ou produit par un générateur synthétique simple) et la spécification d'un composant batterie, et retourne la projection dans le temps de SoC, SoH, vieillissement calendaire, vieillissement cyclique, tension, courant et température sur la durée de vie du pack. Les clients s'en servent pour valider qu'une chimie de cellule et un design de pack candidats survivent à un cycle de service cible avant l'achat ; le même script produit aussi les preuves de calibration qui alimentent les courbes de garantie du capacity sizer.

## Tech

Bâti sur la librairie batterie interne `lair` (`Battery` / `Cell` / `Stack` / `ElectroChemEntity` avec des modèles `Soh` interchangeables) et sur le module `altergo_sdk.tools.sim` (`Sensor`, `update_time_step`). `batteryStateMachine` (depuis `lair.components.battery_iq.clone`) impose l'enveloppe de sécurité — taper de charge à `maxSoC - 5 %`, hystérésis thermique 55 °C / 45 °C, déclenchements `lowVoltageSafetyCutoff` / `highVoltageSafetyCutoff`, écrêtage du courant. Le pas de temps est adaptatif : court pendant les transitoires, long pendant les repos. L'enregistrement passe par des `Sensor` à seuil de variance pour garder une sortie compacte sur les runs pluriannuels, avec des seuils ramenés près de zéro sur les "record days" configurés en début et en fin pour résoudre finement les fenêtres frontières. `main.py` enveloppe la boucle dans un job de plateforme Altergo qui lit `altergo-settings.json`, télécharge le dataset de profil, lance la simulation, et renvoie les résultats sous forme de graphes Plotly.

## Status

Brique active de la chaîne d'outils battery-engineering Altergo en 2025 ; tourne à la demande sur la plateforme dans le cadre des études de dimensionnement et de validation de durée de vie clients. Écrit en contributeur dans l'organisation ION-Altergo. Pas un one-shot — le code intègre le précachage de profil, des runs locaux en mode debug, et un utilitaire de répétition de profil pour stresser les chimies contre des cycles accélérés sur plusieurs années.
