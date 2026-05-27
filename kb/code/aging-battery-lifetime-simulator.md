---
name: "aging_battery_lifetime_simulator"
url: https://github.com/ION-Altergo/aging_battery_lifetime_simulator
role: contributor
visibility: private
description: "Digital-twin simulation of battery lifecycle under power profiles, ambient conditions, and safety cutoffs."
year: 2025
last_active: "2025-06"
language: "Python"
code_bytes: 89650
archived: false
tags: [battery, energy, python, simulation]
---

aging_battery_lifetime_simulator runs a digital-twin simulation of a battery's lifecycle under user-supplied power profiles, ambient conditions, and safety cutoffs. A state machine handles charge tapering and temperature/voltage/current safety stops while sensors track SoC, SoH, voltage, current, and temperature on an adaptive timestep. Used internally to project how a pack ages under realistic operational envelopes; Plotly-ready output for downstream visualisation.
