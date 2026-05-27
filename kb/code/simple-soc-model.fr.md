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
