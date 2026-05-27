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

## What
Prend en entrée une consigne de puissance plant et une configuration de site, et produit un dispatch résolu dans le temps : puissance instantanée par conteneur, SoE par conteneur, charge par entrée BT, et puissance côté transformateur après pertes. L'objectif est de répondre à « cette loi de contrôle délivre-t-elle la puissance AC demandée sans dépasser une entrée BT ni violer les enveloppes C-rate ? » avant d'accorder les gains sur l'EMS réel.

## Tech
`bess_model.py` construit la topologie (conteneurs regroupés sous quatre entrées BT, transformateur IDT avec modèle de pertes fer + cuivre, redistribution proportionnelle en saturation) ; `sim.py` intègre la boucle pas à pas avec `PlantPowerPID` au niveau plant et un second PID optionnel compensant le déséquilibre par entrée ; les courbes C-rate charge/décharge dépendant du SoE bornent chaque conteneur. `dash_app.py` câble un configurateur (durée, conteneurs par entrée BT, rating transformateur, toggles PID) aux traces Plotly de `plotting.py`. Python pur — aucune dépendance au SDK ni à la plateforme Altergo.

## Status
Bac à sable interne de logique de contrôle chez Altergo, dernière activité 2025-05. Utilisé pour prototyper les stratégies de dispatch et de compensation de déséquilibre avant leur intégration dans l'EMS de production.
