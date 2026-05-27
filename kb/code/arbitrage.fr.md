---
name: "arbitrage"
url: https://github.com/ION-Altergo/arbitrage
role: contributor
visibility: private
description: "Optimiseur d'arbitrage BESS : planning day-ahead en LP avec ajustement temps réel."
year: 2025
last_active: "2025-06"
language: "Python"
code_bytes: 40245694
archived: false
tags: [battery, energy, python, optimization]
---

arbitrage est un optimiseur d'arbitrage pour Battery Energy Storage System (BESS), couvrant le planning day-ahead et l'ajustement temps réel. Programmation linéaire via PuLP pour maximiser le profit sur des pas configurables (15 min, 30 min, horaire), sous contraintes de rendement aller-retour, de limites en cycles équivalents complets et de retour à la SOE initiale ; une couche temps réel compare LMP/RT au day-ahead et dévie quand l'écart le justifie. Codebase Python avec sorties compatibles EMS/SCADA ; le gros du dépôt est du HTML Plotly embarqué.
