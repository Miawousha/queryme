---
name: "blueprint-creator"
url: https://github.com/ION-Altergo/blueprint-creator
role: contributor
visibility: private
description: "CLI interactive basée sur Rich pour parcourir, étendre et convertir les blueprints Altergo via le SDK."
year: 2026
last_active: "2026-01"
language: "Python"
code_bytes: 275269
archived: false
tags: [python, tooling]
---

blueprint-creator est une CLI Python interactive (« BP Extender ») qui pilote le SDK Altergo pour gérer des blueprints sur plusieurs environnements. Le menu guide l'opérateur dans la sélection d'environnement, la recherche et la vue arborescente des blueprints, l'inspection des paramètres et schémas, la création de hiérarchies enfants depuis du JSON simspec, la conversion entre formats et la suppression en masse — avec tables, bannières et rapports de diff rendus en Rich et écrits dans `data/`. Outillage développeur interne pour l'écriture de blueprints à l'échelle.

## What
L'opérateur lance `run.py`, choisit un environnement dans `envs/`, et atterrit dans un menu numérique rendu en Rich — ce n'est pas une CLI à flags. Depuis là il recherche des blueprints par nom ou ID, parcourt l'arbre des enfants, inspecte les définitions de paramètres et de schémas, génère une hiérarchie enfant depuis un JSON simspec, convertit d'anciens blueprints au format courant, ou supprime une liste en masse. Les rapports de diff et de conversion atterrissent dans `data/` pour être revus avant publication.

## Tech
`bp_extender/cli.py` porte la boucle de menu ; `client.py` enveloppe le SDK Altergo avec une auth scopée par environnement (`envs/<env>.json`) ; `extender.py` construit les hiérarchies enfants depuis simspec ; `converter.py` gère la migration de format ; `schema.py` introspecte les schémas de blueprint ; `cli_reports.py` écrit les artefacts de diff. Rich pilote chaque table, bannière et indicateur de progression. Le support multi-env permet à un même opérateur de passer entre dev, staging et prod sans cérémonie de ré-authentification.

## Status
Outillage développeur actif chez Altergo, dernière mise à jour 2026-01. Utilisé par l'équipe modélisation pour maintenir les catalogues de blueprints synchronisés entre environnements et amorcer de nouvelles hiérarchies d'assets sans éditer du JSON à la main.
