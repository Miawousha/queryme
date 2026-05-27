---
name: "cellsos"
url: https://github.com/ION-Altergo/cellsos
role: contributor
visibility: private
description: "Modèle de sûreté cellule avec scoring de stress et derating de courant 2D, déployable via le SDK Altergo."
year: 2025
last_active: "2025-11"
language: "Python"
code_bytes: 31506
archived: false
tags: [battery, python]
---

cellsos est un `CellLimitsModel` Python bâti sur l'`AltergoModelBoilerplate` d'Altergo, qui surveille la tension, la température et le courant des cellules lithium contre leurs limites d'opération sûres. Les limites de courant charge et décharge dynamiques sont interpolées depuis une table de derating 2D température × SOC (`current_limits_table.json`) via `scipy.RegularGridInterpolator` ; les sorties incluent des marges de sécurité par paramètre, une marge minimale combinée, un score de stress instantané 0–100 %, un stress cumulé intégré dans le temps, et un statut global OK/Warning/Critical. Dépôt de modèle interne câblé via le SDK pour être déployé contre des assets jumeaux en production.

## What
Consomme la télémétrie cellule en direct (V, T, I) depuis un asset jumeau-numérique, plus l'enveloppe d'opération sûre de la cellule et une table de derating 2D température × SOC. Émet un flux continu de signaux de sécurité sur lesquels un opérateur peut alerter, plus un score de stress que la couche analytique peut intégrer dans le temps : à quel point chaque paramètre est proche de sa limite, où la marge combinée est la plus serrée, à quel point la cellule est stressée à l'instant, et quel stress accumulé elle a encaissé.

## Tech
`models/cell_limits/cell_limits.py` héberge l'unique `CellLimitsModel`. Les plafonds de courant charge et décharge dynamiques viennent de `current_limits_table.json` interpolé avec `scipy.interpolate.RegularGridInterpolator` sur température et SOC. Les marges par paramètre sont normalisées à la distance à la limite ; la marge de sécurité combinée est le minimum sur V/T/I ; le score de stress mappe 0 % (au fond de l'enveloppe) à 100 % (à la limite), puis s'accumule dans le temps pour la sortie de stress cumulé. Le tri-état OK/Warning/Critical sort de seuils de marge configurables. `entrypoint_simple.py` et `entrypoint_advanced.py` enregistrent le modèle pour le déploiement SDK.

## Status
Modèle jumeau-numérique interne Altergo, dernière activité 2025-11. Déployé via le SDK contre des assets cellule en production pour alimenter les tableaux de bord de sécurité et l'analytique de vieillissement.
