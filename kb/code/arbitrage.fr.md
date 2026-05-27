---
name: "arbitrage"
url: https://github.com/ION-Altergo/arbitrage
role: contributor
visibility: private
description: "MILP d'arbitrage BESS pour le planning day-ahead, complété d'une couche d'ajustement temps réel pilotée par les prix RT/LMP."
year: 2025
last_active: "2025-06"
language: "Python"
code_bytes: 40245694
archived: false
tags: [battery, energy, python, optimization]
---

arbitrage optimise le trading d'un Battery Energy Storage System sur les marchés day-ahead et temps réel. `bess_arbitrage_optimizer.py` formule un MILP en PuLP sur un horizon de 24 h, à un pas de 15, 30 ou 60 minutes, avec des variables continues de puissance de charge/décharge et d'état d'énergie, des variables binaires d'état (charging / discharging / idle / soak — exactement une active par période), une fenêtre de "soak" d'environ 2 h au-dessus d'un SoC minimum, des plafonds de cycles équivalents complets par jour, des limites de puissance dépendantes de la SOE (interpolées à partir de tableaux), un rendement aller-retour et un retour imposé à la SOE initiale. `realtime_bess_optimizer.py` consomme ensuite le planning produit et décide de suivre, dévier ou couper en urgence en fonction de l'écart RT/DA, des limites de déviations consécutives, d'une marge de sécurité sur les FCE, du coût de transaction et des bornes de SOE. Des chargeurs pour le DAM indien et des exporteurs de plannings EMS/SCADA cohabitent ; les 40 Mo du dépôt sont surtout du HTML Plotly embarqué.
