---
name: "battery_capacity_sizer"
url: https://github.com/ION-Altergo/battery_capacity_sizer
role: contributor
visibility: private
description: "BESS sizing engine: assemblies-over-components model with year-by-year augmentation strategy simulation."
year: 2025
last_active: "2025-09"
language: "Python"
code_bytes: 598726
archived: false
tags: [battery, energy, python, simulation]
---

battery_capacity_sizer sizes and forward-projects a BESS site from a build instruction and a load requirement. The codebase layers `assemblies/` (BESS → EnergyBlock tree → PowerConversionUnit) over `components/` (BatteryContainer, PCSUnit, Transformer, SwitchGear, MiniSoH, auxiliary consumption) over `requirements/` (load profile). `main.py` dispatches three modes: `bess_summary_generation` builds the site once and emits a nameplate / weighted-efficiency / power-stack summary checked against a `DesignRuleChecker`; `bess_augmentation_strategy` runs `BESS.simulate_time()` year-by-year under a `MaintenanceStrategy` to model SoH decay, container additions, and yearly effective-capacity targets; `bess_single_degradation` simulates a single degradation trajectory. Sizing is therefore iterative (year-stepped simulation with maintenance triggers), not a closed-form formula, and outputs include the Plotly HTML capacity, power-rating and PCU-bandwidth heatmaps used in customer-facing deliverables.
