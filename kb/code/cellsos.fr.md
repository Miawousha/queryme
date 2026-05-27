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
