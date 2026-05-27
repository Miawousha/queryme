---
name: "blueprints_importer"
url: https://github.com/ION-Altergo/blueprints_importer
role: contributor
visibility: private
description: "App plateforme Altergo qui génère en masse des blueprints depuis un fichier Excel ou des dataset IDs."
year: 2025
last_active: "2025-10"
language: "Python"
code_bytes: 97633
archived: false
tags: [python, tooling]
---

blueprints_importer est une app Python packagée pour la plateforme Altergo (déclarée dans `altergo-settings.json` comme app de catégorie Simulation) qui ingère un classeur Excel de composants batterie et non-batterie et les matérialise en blueprints plateforme. Le pipeline `main.py` télécharge le classeur, extrait les entrées en CSV et images, génère des templates JSON de blueprints, puis supprime et régénère les blueprints ciblés et leurs datasets via le SDK Altergo ; une branche « new_format » construit à la place les blueprints directement à partir des `datasetIds` référencés. Filtre par nom ou par catégorie (Battery, Stack, Module, Cell) et supporte les modes d'import `all`, `only_new_blueprints`, `only_specified_blueprints`, `only_specified_categories`, `new_format`.
