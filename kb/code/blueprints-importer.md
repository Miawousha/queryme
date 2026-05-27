---
name: "blueprints_importer"
url: https://github.com/ION-Altergo/blueprints_importer
role: contributor
visibility: private
description: "Altergo platform app that bulk-generates blueprints from an Excel workbook or dataset IDs."
year: 2025
last_active: "2025-10"
language: "Python"
code_bytes: 97633
archived: false
tags: [python, tooling]
---

blueprints_importer is a Python app packaged for the Altergo platform (declared in `altergo-settings.json` as a Simulation app) that ingests an Excel workbook of battery and non-battery components and materialises them as platform blueprints. The `main.py` pipeline downloads the workbook, extracts inputs to CSV and images, generates JSON blueprint templates, then deletes and regenerates the targeted blueprints and their datasets through the Altergo SDK; a "new_format" branch instead builds blueprints directly from referenced `datasetIds`. Filters by name or by category (Battery, Stack, Module, Cell) and supports import modes `all`, `only_new_blueprints`, `only_specified_blueprints`, `only_specified_categories`, `new_format`.

## What
Input is an Excel workbook held in shared storage with one sheet per component family (Battery, Stack, Module, Cell, plus non-battery parts). Output is a refreshed set of platform blueprints and their backing datasets visible to every downstream simulation app. Operators trigger it from the Altergo platform UI; the run filters by name or category and picks an import mode to bound the blast radius (regenerate everything, only-new, only-specified, only-categories, or the dataset-id-driven new_format path).

## Tech
`main.py` orchestrates the pipeline; `src/download_xlsx.py` pulls the workbook; `src/inputs_extractor_from_excel.py` writes per-component CSV and image artifacts; `src/generate_json_bp_battery_templates_from_csv.py` and its non-battery sibling produce blueprint JSON; `src/generate_bp_battery.py`, `src/generate_bp_non_battery.py`, and `src/create_bps_from_datasets.py` call the Altergo SDK to delete and recreate blueprints and datasets atomically; `src/delete_bps.py` handles the cleanup pass. `altergo-settings.json` registers it as a Simulation-category platform app with its parameter schema.

## Status
Internal Altergo bulk-import tool, last active 2025-10. Run when the upstream component spreadsheet changes and the platform catalog needs to be rebuilt. `requirements.txt` ships a hard-coded Bitbucket access token — already flagged to the owner; should be rotated and moved to env config.
