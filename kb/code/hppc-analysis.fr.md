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

## What
L'entrée est une cellule NMC unique (asset `NMC_CELL_1_CUSTOM_617` sur `demo.altergo.io`) sur un test HPPC d'environ 10 jours, tiré via `altergoClient.getAssetSensorData` pour `Cycle_Number`, `Voltage`, `Current`, `Temperature`. La convention est que chaque cycle commence et finit à 100 % SOC et atteint 0 % à l'inversion décharge→charge, ce qui permet d'ancrer le comptage coulombique cycle par cycle sans accumulation de dérive. Les points OCV ne sont retenus que si l'écart-type de tension pendant le repos est sous 10 mV, et les fits ECM sont filtrés pour rester physiquement plausibles (1–100 mΩ pour R0, 0,1–50 mΩ pour R1/R2). Le `battery_config_from_analysis.json` exporté est le contrat consommé par les simulateurs Lair (cf. le workflow BatteryArchitectureBuilder du dépôt `hydrogen`).

## Tech
Script unique de 74 ko, ~2 kLOC, organisé en pipeline procédural : `load_full_dataset` → `identify_hppc_cycles` → par cycle `calculate_proper_soc_for_cycle` + `find_rest_periods` + `extract_ocv_points` + `identify_pulses` → `fit_ecm_to_pulse` → `create_comprehensive_ocv_table` (21 bins SOC, fenêtre ±5 %) → `generate_battery_config`. Stack : numpy, pandas, scipy (`savgol_filter` fenêtre 51, polyorder 3 ; `interp1d` ; `curve_fit` importé mais inutilisé pour R0/R1/R2), plotly subplots pour le rapport HTML, altergo-sdk pour la récupération des données. Le dépôt embarque un arbre `archive_development_files/` et `archive_removed_files/` plus les rapports HTML — le code lui-même est petit, mais les artefacts gonflent la taille à 48 Mo.

## Status
Construit en 2025 sur des données réelles de cellule NMC dans le tenant demo Altergo. Utilisé comme étape de prétraitement hors-ligne : à exécuter une fois pour caractériser une cellule, puis déposer le JSON dans des simulations Lair. Pas un modèle Altergo déployé (pas d'`altergo-settings.json`, pas de boilerplate) — une analyse data-only autonome. Le JSON de sortie est la surface d'intégration ; tout le reste (CSV, HTML) sert à la revue humaine.
