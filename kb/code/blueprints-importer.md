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
