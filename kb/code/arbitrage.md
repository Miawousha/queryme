---
name: "arbitrage"
url: https://github.com/ION-Altergo/arbitrage
role: contributor
visibility: private
description: "BESS arbitrage optimizer: day-ahead LP schedule with real-time deviation logic."
year: 2025
last_active: "2025-06"
language: "Python"
code_bytes: 40245694
archived: false
tags: [battery, energy, python, optimization]
---

arbitrage is a Battery Energy Storage System (BESS) arbitrage optimizer for day-ahead scheduling with real-time deviation capabilities. Uses PuLP linear programming to maximize profit on configurable 15-min/30-min/hourly intervals subject to round-trip efficiency, full-equivalent-cycle limits, and SOE-return constraints; a separate real-time layer compares LMP/RT vs day-ahead prices and deviates when the spread justifies it. Python codebase with EMS/SCADA-compatible outputs; the bulk of repo size is bundled Plotly HTML.
