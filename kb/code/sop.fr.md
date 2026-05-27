---
name: "sop"
url: https://github.com/ION-Altergo/sop
role: contributor
visibility: private
description: "State-of-Power — courant max soutenable en charge/décharge sur un horizon 1–10 min, Thevenin + ECM."
year: 2025
last_active: "2025-09"
language: "Python"
code_bytes: 52763
archived: false
tags: [battery, python, simulation]
---

sop est le modèle State-of-Power de la plateforme jumeau numérique Altergo — sur un horizon configurable de 1 à 10 minutes, il calcule le courant maximal que le pack peut soutenir en charge et en décharge avant de buter sur une limite de tension, courant, puissance, SoC ou température. La physique est une relation Thevenin `V = OCV ± I*R` imposée au SoC de fin d'horizon, avec tables OCV(SoC,T) et R(SoC,T) en interpolation bilinéaire, ECM optionnel à 3-RC donnant `R_eff(τ) = R0 + Σ Rᵢ(1 − exp(−τ/τᵢ))` avec mise à l'échelle en SoC, température et SoH, plus les caps PCS en kW projetés en courants équivalents et des gates SoC en base coulomb ou énergie. Bâti sur le scaffold model-boilerplate, partage le dépôt avec un modèle `eq_cycles`.
