---
name: "rtbm_dataset_generator"
url: https://github.com/ION-Altergo/rtbm_dataset_generator
role: contributor
visibility: private
description: "Matrix DoE framework that generates synthetic battery simulation datasets with controlled fault profiles."
year: 2026
last_active: "2026-01"
language: "Python"
code_bytes: 169798
archived: false
tags: [battery, python, simulation, data-only]
---

rtbm_dataset_generator is a matrix-based Design-of-Experiment framework for generating synthetic battery simulation datasets at ION-Altergo. Instead of cramming multiple faults into one asset, it emits one asset per profile-fault combination and applies statistical multipliers, producing CSV/JSON datasets plus interactive Plotly anomaly-highlighted plots. Built on the Altergo SDK and the internal `lair.components.battery_iq` physics core; powers training data for the real-time battery model.
