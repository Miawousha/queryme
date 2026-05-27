---
name: "cellsos"
url: https://github.com/ION-Altergo/cellsos
role: contributor
visibility: private
description: "Cell-level safety and stress-scoring model with 2D current derating, deployable on the Altergo SDK."
year: 2025
last_active: "2025-11"
language: "Python"
code_bytes: 31506
archived: false
tags: [battery, python]
---

cellsos is a Python `CellLimitsModel` built on the Altergo `AltergoModelBoilerplate`, monitoring lithium cell voltage, temperature, and current against their safe operating limits. Dynamic charge and discharge current limits are interpolated from a 2D temperature × SOC derating lookup (`current_limits_table.json`) via `scipy.RegularGridInterpolator`; outputs include per-parameter safety margins, a combined minimum margin, an instantaneous 0–100 % stress score, time-integrated cumulative stress, and an overall OK/Warning/Critical safety status. Internal model repo wired through the SDK to deploy against live digital-twin assets.
