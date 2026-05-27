---
name: "hppc_analysis"
url: https://github.com/ION-Altergo/hppc_analysis
role: contributor
visibility: private
description: "Caractérisation batterie HPPC avec comptage coulombique propre ; produit une table OCV et des paramètres ECM physiques."
year: 2025
last_active: "2025-09"
language: "Python"
code_bytes: 48722269
archived: false
tags: [battery, python, data-only]
---

hppc_analysis transforme des données de test HPPC (Hybrid Pulse Power Characterization) en une table OCV complète et en paramètres d'un modèle équivalent à constantes localisées (ECM) à base physique. Le comptage coulombique alimente une courbe OCV à 19 points de 5 à 95 % de SOC, avec des plages de résistances réalistes (1–100 mΩ) et des constantes de temps fixes (τ₁ = 5 min, τ₂ = 25 min) sur 64 cycles. La sortie est un JSON de configuration batterie consommé en aval par les codes de simulation et de modélisation ; la taille du dépôt est principalement due aux rapports HTML embarqués.
