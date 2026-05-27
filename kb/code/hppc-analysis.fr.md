---
name: "hppc_analysis"
url: https://github.com/ION-Altergo/hppc_analysis
role: contributor
visibility: private
description: "Pipeline HPPC : SOC par comptage coulombique, table OCV depuis les périodes de repos, résistances ECM physiques à constantes de temps fixées."
year: 2025
last_active: "2025-09"
language: "Python"
code_bytes: 48722269
archived: false
tags: [battery, python, data-only]
---

hppc_analysis est un pipeline HPPC mono-fichier (~2 kLOC) qui ajuste des cellules NMC à partir de tirages bruts du SDK Altergo en une configuration batterie prête à l'emploi. `hppc_analysis_full.py` segmente chaque cycle autour de l'inversion de courant décharge→charge, intègre le courant avec un comptage coulombique lissé par `scipy.signal.savgol_filter` pour obtenir le SOC, extrait l'OCV depuis des périodes de repos ≥ 25 minutes, et calcule R0/R1/R2 directement à partir des écarts de tension à V_before / V_2s / V_5min / V_end avec τ₁ = 5 min et τ₂ = 25 min fixées (pas de curve fit). Produit un CSV OCV, un CSV de paramètres ECM, un résumé de cycles, un rapport HTML interactif et `battery_config_from_analysis.json` consommé en aval par le code de simulation ; les 48 Mo du dépôt sont quasi entièrement ces rapports Plotly HTML embarqués.
