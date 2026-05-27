---
name: "supplier-data-mapping"
url: https://github.com/ION-Altergo/supplier-data-mapping
role: contributor
visibility: private
description: "Outillage de classification de signaux BESS — agents orchestrés par Cursor, outils Python et catalogues JSON."
year: 2026
last_active: "2026-01"
language: "Python"
code_bytes: 119336
archived: false
tags: [ai, agent, python, tooling, battery, energy]
---

supplier-data-mapping est l'outillage qu'ION-Altergo utilise pour transformer les listes de signaux fournisseurs (CSV, Excel, JSON venus des fabricants de stockage batterie) en mappings de capteurs standardisés pour la plateforme de jumeau numérique. Les « agents » sont des runbooks markdown (`AGENT_CLASSIFIER.md`, `ADD_SENSOR_TOOL.md`) qu'un orchestrateur LLM — Cursor en pratique — suit, soutenus par des outils Python réellement exécutables : `ai_batch_processor.py` découpe les données et appelle le SDK Anthropic, `agent_io_tool.py` gère les I/O tabulaires, `add_sensor_to_catalog.py` et `check_design_compliance.py` modifient et valident le catalogue. L'état vit dans `sensor_catalog.json` et `blueprint_catalog.json` ; la doc associée fixe les classes de signaux, les conventions de nommage et la conception des modèles de capteurs, pour que humains et agents partagent une seule source de vérité. Produit interne en développement actif.
