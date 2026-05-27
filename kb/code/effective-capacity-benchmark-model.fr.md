---
name: "effective-capacity-benchmark-model"
url: https://github.com/ION-Altergo/effective-capacity-benchmark-model
role: contributor
visibility: private
description: "Scaffold function-template Altergo câblé pour un capteur de cycles équivalents — l'entrypoint ne calcule rien."
year: 2024
last_active: "2024-10"
language: "Python"
code_bytes: 1017
archived: false
tags: [battery, python, demo]
---

effective-capacity-benchmark-model est un scaffold function-template Altergo : `entrypoint.py` extrait les arguments de la plateforme, initialise le client SDK et récupère l'asset par ID — puis s'arrête. L'`altergo-settings.json` le déclare comme modèle « Performance » lisant un capteur `Current` + un paramètre `Capacity` et écrivant une sortie `Equivalent Cycles`, mais la logique du benchmark elle-même est absente. Placeholder / scaffold inachevé malgré le nom.

## What
Le nom du dépôt suggère un benchmark de capacité effective (Ah mesurés vs nominal comme indicateur de SOH), mais les I/O déclarés sont des cycles équivalents, pas de la capacité. L'incohérence et le corps vide signalent ensemble qu'il s'agit d'un scaffold classé sous un titre de travail et jamais terminé. En l'état, l'exécuter ne fait rien d'utile : il s'authentifie auprès d'Altergo et tire une référence d'asset.

## Tech
Utilise `extract_altergo_parameters()` et `Client(functionArguments=altergoArguments)` depuis `altergo_sdk` pour gérer les credentials, les URLs des API factory/IoT et l'`assetId` injecté par la plateforme à l'exécution. L'`altergo-settings.json` suit l'ancien schéma mono-modèle `bp_sensors` / `bp_parameters` (antérieur au registre multi-modèles `enabled_models` utilisé dans le dépôt `impedance`). 1 ko de Python, trois imports, aucun calcul.

## Status
Créé en 2024, intouché depuis. Antérieur au pattern boilerplate (`AltergoModelBoilerplate`) standardisé par le dépôt `impedance`. Code mort de fait dans l'org ION-Altergo — à reconvertir en vrai modèle de capacité effective ou à supprimer.
