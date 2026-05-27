---
name: "soc"
url: https://github.com/ION-Altergo/soc
role: contributor
visibility: private
description: "Estimateur SoC à double borne — comptage coulombique + table OCV avec Peukert et dynamique multi-RC."
year: 2025
last_active: "2025-10"
language: "Python"
code_bytes: 231835
archived: false
tags: [battery, python, simulation]
---

soc est l'estimateur State-of-Charge actuel de la plateforme jumeau numérique Altergo — un algorithme à double borne qui fait tourner en parallèle un comptage coulombique et une lecture de table OCV avant de les fusionner, avec des marges d'erreur asymétriques pour qu'à chaque pas il émette un SoC et son intervalle d'incertitude. Bâti sur le scaffold model-boilerplate (`register_model("soc")`) ; le cœur gère compensation Peukert en décharge, modèle de tension dynamique multi-RC avec constantes de temps compensées en température, filtrage médian + passe-bas de l'OCV, contraintes directionnelles, détection de repos, et capacité effective mise à l'échelle par le SoH. Remplace `soc-model` (2024) ; livre aussi une variante historical-SoC pour le rejeu itératif sur données passées en plus de l'estimateur temps réel.
