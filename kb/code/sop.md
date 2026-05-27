---
name: "sop"
url: https://github.com/ION-Altergo/sop
role: contributor
visibility: private
description: "State-of-Power — max sustainable charge/discharge current over a 1–10 min horizon, Thevenin + ECM."
year: 2025
last_active: "2025-09"
language: "Python"
code_bytes: 52763
archived: false
tags: [battery, python, simulation]
---

sop is the State-of-Power model on the Altergo digital-twin platform — over a configurable 1–10 minute horizon, it computes the maximum current the pack can sustain in charge and discharge before hitting a voltage, current, power, SoC, or thermal limit. The physics is a Thevenin terminal relation `V = OCV ± I*R` enforced at end-of-horizon SoC, with bilinear OCV(SoC,T) and R(SoC,T) lookup tables, optional 3-RC ECM giving `R_eff(τ) = R0 + Σ Rᵢ(1 − exp(−τ/τᵢ))` with SoC/temperature/SoH-dependent scaling, plus PCS kW caps mapped to equivalent currents and coulomb- or energy-based SoC-window gates. Built on the model-boilerplate scaffold, alongside an `eq_cycles` model in the same repo.
