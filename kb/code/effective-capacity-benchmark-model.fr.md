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
