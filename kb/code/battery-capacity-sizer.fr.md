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

## What

Outil pré-vente et ingénierie qui transforme une exigence du type « on veut X MWh / Y MW sur Z ans avec telle garantie de SoH » en une configuration BESS buildable plus le plan d'augmentation année par année nécessaire pour la tenir. Le mode `bess_summary_generation` donne la réponse rapide (« cette configuration satisfait-elle même les règles de design ? ») ; `bess_augmentation_strategy` donne la réponse profonde (« combien d'ajouts de containers, et en quelles années, pour rester au-dessus de la courbe de garantie de capacité effective ? ») ; `bess_single_degradation` produit la trajectoire d'une stratégie choisie. Les sorties alimentent des PDF et dashboards livrés aux clients.

## Tech

Modèle objet en trois couches : `assemblies/` (`BESS`, `EnergyBlock`, `PowerConversionUnit`) compose `components/` (`BatteryContainer`, `PCSUnit`, `Transformer`, `SwitchGear`, `MiniSoH`, `auxillary/`) contre un profil de charge dans `requirements/`. Le dimensionnement n'est pas une formule fermée — `BESS.simulate_time(years)` fait tourner une boucle explicite pas-année pilotée par une `MaintenanceStrategy` (`utils.helpers.augmentation_configuration.MaintenanceStrategy`) qui décide quand ajouter des containers pour maintenir la capacité effective au-dessus de la cible annuelle. Un `DesignRuleChecker` (`utils/drc.py`) valide l'instruction de build contre la blueprint library et marque les `input_issues` avant toute simulation. La visualisation passe par des heatmaps Plotly pour la capacité, la puissance et la bande passante PCU.

## Status

Brique active de la chaîne d'outils pré-vente / ingénierie d'Altergo en 2025 (dernière activité septembre 2025). Environ 600 Ko de code, avec un dossier `tests/`, un `sandbox/`, un `CHANGELOG.md` et un `altergo_demo_builder/` — la maturité d'un vrai produit, pas d'un notebook. Écrit en contributeur dans ION-Altergo. Les sorties Plotly sont câblées dans les livrables clients, donc les changements ici se voient en aval.
