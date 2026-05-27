---
name: "simple_soc_model"
url: https://github.com/ION-Altergo/simple_soc_model
role: contributor
visibility: private
description: "Scaffold pédagogique — function-template Altergo avec une classe SoC triviale en comptage coulombique."
year: 2024
last_active: "2024-10"
language: "Python"
code_bytes: 2683
archived: false
tags: [battery, python, demo]
---

simple_soc_model est le scaffold function-template d'Altergo avec un algorithme SoC placeholder — `my_soc.py` est une classe de 10 lignes qui décrémente le SoC par `current * dt / capacity * 100` (comptage coulombique de base, sans OCV, sans température, sans bornes d'erreur). `entrypoint.py` le câble au SDK, écrit un `hello.txt` et enregistre une sortie de tâche. Exemple pédagogique pour la structure function-template, pas un vrai estimateur.

## What
Montre à un développeur à quoi ressemble de bout en bout une fonction Altergo de type "model" : init du client SDK, lookup `assetId` et `programTaskId`, extraction des paramètres, une classe d'algorithme triviale, une sortie à effet de bord, et l'enregistrement d'un résultat de tâche "Visualize C-Rate" pour que l'UI plateforme reçoive un lien cliquable vers les données de l'asset. Deux frères vides (`my_model.py`, `model-validation.json`) sont là comme emplacements qu'un vrai modèle remplirait.

## Tech
`my_soc.py` est une classe `SOC(capacity, SOC)` avec une seule méthode `update_SOC(current, dt)` — `delta_SOC = current*dt/capacity*100; SOC -= delta_SOC; clamp à 0`. Pas de clamp supérieur, pas de température, pas de correction OCV, pas de gestion du sens de courant. `entrypoint.py` monte le client SDK depuis `apiKey`/`factoryApi`/`iotApi`, écrit `hello.txt`, récupère la tâche par id, fixe `task.output = [{name, icon, description, url}]` pointant vers `/assets`, et appelle `updateTask`. Le README est le mode d'emploi générique du template.

## Status
Dernier commit 2024-10. Utilisé comme exemple pédagogique canonique pour les nouveaux développeurs plateforme — couplé à `simple-app` pour montrer les deux familles de fonction. Non déployé ; la vraie implémentation SoC est passée à `soc-model` (2024) puis `soc` (2025).
