---
name: "aging_battery_lifetime_simulator"
url: https://github.com/ION-Altergo/aging_battery_lifetime_simulator
role: contributor
visibility: private
description: "Simulation en jumeau numérique du cycle de vie batterie sous profils de puissance, conditions ambiantes et coupures de sécurité."
year: 2025
last_active: "2025-06"
language: "Python"
code_bytes: 89650
archived: false
tags: [battery, energy, python, simulation]
---

aging_battery_lifetime_simulator simule le cycle de vie d'une batterie sous forme de jumeau numérique, à partir de profils de puissance, conditions ambiantes et coupures de sécurité fournis en entrée. Une machine à états gère la phase de taper de charge et les arrêts de sécurité en température/tension/courant pendant que les capteurs suivent SoC, SoH, tension, courant et température sur un pas de temps adaptatif. Utilisé en interne pour projeter le vieillissement d'un pack sous des enveloppes opérationnelles réalistes ; sorties prêtes pour Plotly.
