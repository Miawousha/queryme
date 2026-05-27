---
name: "cell-model-visualizer"
role: author
visibility: private
description: "Vite/React tool to inspect a battery cell-model JSON across OCV, impedance, thermal, aging, and safety tabs."
year: 2025
last_active: "2025-09"
language: "TypeScript"
code_bytes: 169848
archived: false
tags: [battery, react, typescript, tooling]
---

cell-model-visualizer is an internal Vite + React 19 app for inspecting a battery cell-model JSON file. Users load a cell into a localStorage-backed library, then flip between Overview / OCV Curves / Impedance / Thermal / Aging / Safety tabs — each rendering Plotly views over the same dataset (manufacturer, model, version, last-updated, characterisation curves). Drag-and-drop import via `FileHandler`; MUI for chrome. Companion tool for cell-modelling work at Altergo; not public.

## What
Seven tabs in a single MUI `AppBar` + `Tabs` shell. **Library** lists cells the
user has imported (with a default demo LiFePO4 32700) and switches the active
cell on click. **Overview** prints physical / electrical / thermal spec sheets
from the JSON. **OCV Curves**, **Impedance**, **Thermal**, **Aging**, and
**Safety** render Plotly views over the characterisation arrays in the JSON
(SOC-OCV tables, EIS spectra, thermal coefficients, aging-model parameters,
safety envelope). The header keeps the active cell's version and last-updated
visible. The JSON is a large nested schema with `physical_properties`,
`electrical_specifications`, voltage range, current ratings, etc. — what
Altergo's modelling team produces from a calibration run.

## Tech
Vite + React 19 + MUI + Plotly. No backend. State lives in two
`localStorage` keys — `cellModelVisualizer_importedCells` (the library) and
`cellModelVisualizer_currentCell` (the active dataset) — so a refresh keeps
your work, but nothing leaves the machine. `FileHandler` accepts drag-and-drop
JSON and routes it through `handleDataImport`, which dedupes by
manufacturer+model. The library design lets engineers compare cells without a
server.

## Status
Built 2025 alongside Altergo's cell-modelling work; last commit 2025-09. Used
internally to sanity-check calibration outputs and to demo what a cell model
"looks like" to non-modelling stakeholders. Private; one shipped demo cell
plus whatever the user imports.
