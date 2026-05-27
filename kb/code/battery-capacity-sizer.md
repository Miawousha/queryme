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

## What

Pre-sales and engineering tool that turns a "we want X MWh / Y MW for Z years with this SoH guarantee" requirement into a buildable BESS configuration plus the year-by-year augmentation plan needed to honour it. The `bess_summary_generation` mode is the quick answer ("does this configuration even satisfy the design rules?"); `bess_augmentation_strategy` is the deep answer ("how many container additions and in which years do we need to keep effective capacity above the warranty curve?"); `bess_single_degradation` produces the trajectory for a chosen strategy. Outputs feed customer-facing PDFs and dashboards.

## Tech

Three-layer object model: `assemblies/` (`BESS`, `EnergyBlock`, `PowerConversionUnit`) composes `components/` (`BatteryContainer`, `PCSUnit`, `Transformer`, `SwitchGear`, `MiniSoH`, `auxillary/`) against a `requirements/` load profile. Sizing is not a closed-form formula — `BESS.simulate_time(years)` runs an explicit year-step loop driven by a `MaintenanceStrategy` (`utils.helpers.augmentation_configuration.MaintenanceStrategy`) that decides when to add containers to keep effective capacity above the yearly target. A `DesignRuleChecker` (`utils/drc.py`) validates the build instruction against the blueprint library and stamps `input_issues` before any simulation runs. Visualisation uses Plotly heatmaps for capacity, power rating, and PCU bandwidth.

## Status

Active component of Altergo's pre-sales / engineering toolchain in 2025 (last touch September 2025). Around 600 KB of code, with a `tests/` directory, a `sandbox/`, a `CHANGELOG.md`, and an `altergo_demo_builder/` — the lifecycle of a real product, not a notebook. Authored as a contributor inside ION-Altergo. The Plotly outputs are wired into customer deliverables, so changes here ship visibly downstream.
