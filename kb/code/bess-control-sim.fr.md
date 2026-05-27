---
name: "bess_control_sim"
url: https://github.com/ION-Altergo/bess_control_sim
role: contributor
visibility: private
description: "Simulateur de dispatch BESS avec PID de régulation, pertes transformateur et configurateur Dash."
year: 2025
last_active: "2025-05"
language: "Python"
code_bytes: 85934
archived: false
tags: [battery, energy, python, simulation]
---

bess_control_sim est un simulateur Python pour la boucle de contrôle EMS d'un site BESS multi-conteneurs. Modélise une flotte de conteneurs derrière un transformateur IDT 30 MVA à quatre entrées BT (ratings par entrée, pertes fer + cuivre, redistribution proportionnelle quand une entrée sature), des courbes de C-rate charge/décharge dépendant du SoE, un PID `PlantPowerPID` et un PID optionnel de compensation de déséquilibre. Une app Dash expose la configuration en panneau gauche (durée de simulation, conteneurs par entrée BT, rating du transformateur, toggles PID) et trace les timeseries de puissance, SoE et par entrée BT en Plotly. Bac à sable interne pour itérer sur la logique de dispatch avant qu'elle ne touche l'EMS de production.
