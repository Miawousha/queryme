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
