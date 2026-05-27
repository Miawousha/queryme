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

## What
L'entrée est un classeur Excel stocké dans un partage, une feuille par famille de composants (Battery, Stack, Module, Cell, plus pièces non-batterie). La sortie est un jeu rafraîchi de blueprints plateforme et leurs datasets sous-jacents, visibles par toutes les apps de simulation aval. Les opérateurs déclenchent l'app depuis l'UI plateforme Altergo ; le run filtre par nom ou catégorie et choisit un mode d'import pour borner le rayon d'impact (tout régénérer, only-new, only-specified, only-categories, ou la voie new_format pilotée par dataset IDs).

## Tech
`main.py` orchestre le pipeline ; `src/download_xlsx.py` télécharge le classeur ; `src/inputs_extractor_from_excel.py` écrit les artefacts CSV et images par composant ; `src/generate_json_bp_battery_templates_from_csv.py` et son équivalent non-batterie produisent les JSON de blueprint ; `src/generate_bp_battery.py`, `src/generate_bp_non_battery.py` et `src/create_bps_from_datasets.py` appellent le SDK Altergo pour supprimer et recréer atomiquement blueprints et datasets ; `src/delete_bps.py` gère la passe de nettoyage. `altergo-settings.json` l'enregistre comme app plateforme de catégorie Simulation avec son schéma de paramètres.

## Status
Outil d'import en masse interne d'Altergo, dernière activité 2025-10. Lancé quand le tableur de composants amont change et que le catalogue plateforme doit être reconstruit. `requirements.txt` embarque un token d'accès Bitbucket en dur — déjà signalé au propriétaire ; à rotater et déplacer dans la configuration d'environnement.
