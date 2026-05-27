---
name: "battery_capacity_sizer"
url: https://github.com/ION-Altergo/battery_capacity_sizer
role: contributor
visibility: private
description: "Moteur de dimensionnement BESS : modèle assemblies-au-dessus-de-composants avec simulation année par année d'une stratégie d'augmentation."
year: 2025
last_active: "2025-09"
language: "Python"
code_bytes: 598726
archived: false
tags: [battery, energy, python, simulation]
---

battery_capacity_sizer dimensionne et projette dans le temps un site BESS à partir d'une instruction de build et d'une exigence de charge. Le code superpose `assemblies/` (BESS → arbre EnergyBlock → PowerConversionUnit) au-dessus de `components/` (BatteryContainer, PCSUnit, Transformer, SwitchGear, MiniSoH, consommation auxiliaire) au-dessus de `requirements/` (profil de charge). `main.py` aiguille trois modes : `bess_summary_generation` construit le site une fois et émet un résumé nameplate / rendements pondérés / power stack validé par un `DesignRuleChecker` ; `bess_augmentation_strategy` fait tourner `BESS.simulate_time()` année par année sous une `MaintenanceStrategy` pour modéliser la décroissance de SoH, l'ajout de containers et les cibles annuelles de capacité effective ; `bess_single_degradation` simule une trajectoire de dégradation unique. Le dimensionnement est donc itératif (simulation pas-à-pas avec déclencheurs de maintenance), pas une formule fermée, et les sorties incluent les heatmaps Plotly de capacité, de puissance et de bande passante PCU livrées aux clients.
