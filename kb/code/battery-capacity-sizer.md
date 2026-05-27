---
name: "battery_capacity_sizer"
url: https://github.com/ION-Altergo/battery_capacity_sizer
role: contributor
visibility: private
description: "Sizes battery capacity for a given load profile, assembled from PCU, container, transformer, and switchgear components."
year: 2025
last_active: "2025-09"
language: "Python"
code_bytes: 598726
archived: false
tags: [battery, energy, python, optimization]
---

battery_capacity_sizer determines the capacity required for a battery system given a load profile, assembling the answer from component-level models — battery containers, PCU units, transformers, switchgear, and a mini-SoH model. Organized as `assemblies/` over `components/` over `requirements/`, so the load profile drives sizing through a layered model rather than a single closed-form formula. Internal tool used to spec BESS installations.
