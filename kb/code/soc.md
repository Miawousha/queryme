---
name: "soc"
url: https://github.com/ION-Altergo/soc
role: contributor
visibility: private
description: "Dual-bound SoC estimator — coulomb counting + OCV lookup with Peukert and multi-RC dynamics."
year: 2025
last_active: "2025-10"
language: "Python"
code_bytes: 231835
archived: false
tags: [battery, python, simulation]
---

soc is the current State-of-Charge estimator for the Altergo digital-twin platform — a dual-bound algorithm that runs coulomb counting and OCV-table lookup in parallel and merges them, with asymmetric error margins so each step emits SoC plus an uncertainty band. Built on the model-boilerplate scaffold (`register_model("soc")`); the core handles Peukert compensation on discharge, multi-RC dynamic voltage with temperature-compensated time constants, median + low-pass OCV filtering, directional constraints, rest detection, and SoH-scaled effective capacity. Supersedes `soc-model` (2024); ships a historical-SoC variant for iterative backfit on past data alongside the realtime estimator.
