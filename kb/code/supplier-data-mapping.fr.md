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

## What
Un nouveau fournisseur BESS livre une liste de signaux — SVOLT, Sunwoda, équivalents — et l'objectif est un mapping un-à-un de leurs tags bruts (avec leurs propres conventions de polarité, échelles de sévérité d'alarme, encodages) vers une hiérarchie de blueprints partagée (`ESRack`, `ESContainer`, `HVAC`, `Cooling`, `FireSafety`, etc.) afin que le jumeau numérique compare les flottes pomme à pomme. L'agent classifier lit chaque ligne fournisseur, infère la clé capteur standard et la classe de signal, propose des éditions du catalogue et écrit le `supplier_mapping.json` résultant avec ses transforms (`value * scale + offset`) et les remaps de sévérité d'alarme. Les ingénieurs pilotent l'agent depuis Cursor ; l'humain reste dans la boucle sur les changements cassants via les vérifications de conformité.

## Tech
Deux couches : runbooks markdown déclaratifs sous `agents/` que n'importe quel LLM peut suivre, et outils Python sous `tools/` et `scripts/` que le runbook invoque. `tools/ai_batch_processor.py` est délibérément agnostique au domaine — il découpe un fichier d'entrée, appelle `anthropic.Anthropic()` avec le prompt fourni par l'orchestrateur, et streame métadonnées structurées sur stdout et logs humains sur stderr. `tools/agent_io_tool.py` gère l'I/O CSV/JSON/Excel ; `scripts/add_sensor_to_catalog.py` mute `sensor_catalog.json` en place, `scripts/check_design_compliance.py` applique les règles de nommage et de blueprint, `scripts/verify_catalog_completeness.py` et `json_to_excel.py` complètent validation et export. Source de vérité : deux fichiers JSON (`sensor_catalog.json` avec son architecture hybride blueprint + group_id, `blueprint_catalog.json`) ; `docs/` codifie classes de signaux et fréquences, conventions de nommage et conception des modèles de capteurs comme référence lisible par agent.

## Status
Produit actif au 2026-01 (v0.5.0 dans le CHANGELOG), avec les mappings SVOLT et Sunwoda livrés et la phase 2 de la roadmap visant deux fournisseurs de plus, PCS et catalogues de transformateurs. Utilisé en interne par les ingénieurs d'intégration onboardant des fournisseurs ; les agents catalogent et valident, les humains revoient les PR. Dépôt GitHub privé sur l'organisation ION-Altergo.
