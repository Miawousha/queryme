---
name: "simple-app"
url: https://github.com/ION-Altergo/simple-app
role: contributor
visibility: private
description: "Scaffold vide pour une app sur la plateforme Altergo — entrypoint, settings, aucune logique."
year: 2024
last_active: "2024-10"
language: "Python"
code_bytes: 740
archived: false
tags: [python, demo]
---

simple-app est le scaffold vide d'une "app" sur la plateforme Altergo (par opposition à un modèle) — `entrypoint.py` initialise le client SDK Altergo, lit les `configurationValues`, et s'arrête sur un commentaire `# Your logic here`. Pas de README, pas de vraie logique ; `altergo-settings.json` déclare un seul paramètre placeholder. Scaffold de référence, pas un projet.

## What
Point de départ qu'un client Altergo ou un développeur interne fork pour construire une "app" plateforme custom — une unité de code que la plateforme planifie et exécute contre des assets, distincte du type "model". Le dépôt fournit un client SDK fonctionnel et le câblage des paramètres ; tout le reste est à remplir.

## Tech
Quatre fichiers : `entrypoint.py` (`extract_altergo_parameters` → `Client(functionArguments=…)`), `altergo-settings.json` (déclare `type: "app"`, un seul placeholder `parameter1`), `dev-parameters.json` (shim d'exécution locale), `requirements.txt` (épingle `altergo-sdk` depuis la branche bitbucket `release/alpha`). Pas de tests, pas de logique, pas de README.

## Status
Dernier commit 2024-10. Vit comme template de référence aux côtés du scaffold function-template (`simple-soc-model`) ; les deux couvrent les côtés "app" et "model" de l'ABI fonction Altergo. Pas un livrable, utilisé par d'autres dépôts comme point de départ.
