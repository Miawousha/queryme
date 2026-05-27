---
name: "rtbm_dataset_generator"
url: https://github.com/ION-Altergo/rtbm_dataset_generator
role: contributor
visibility: private
description: "Framework DoE matriciel pour générer des jeux de données simulés de batterie avec profils de défauts contrôlés."
year: 2026
last_active: "2026-01"
language: "Python"
code_bytes: 169798
archived: false
tags: [battery, python, simulation, data-only]
---

rtbm_dataset_generator est un framework de Design-of-Experiment matriciel pour produire des jeux de données simulés de batterie chez ION-Altergo. Au lieu d'empiler plusieurs défauts sur un même asset, il émet un asset par combinaison profil-défaut et applique des multiplicateurs statistiques, ce qui donne des datasets CSV/JSON et des graphes Plotly interactifs avec mise en évidence des anomalies. Bâti sur le SDK Altergo et le cœur physique interne `lair.components.battery_iq` ; alimente les données d'entraînement du modèle batterie temps réel.
