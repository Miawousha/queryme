---
name: "hppc_analysis"
url: https://github.com/ION-Altergo/hppc_analysis
role: contributor
visibility: private
description: "HPPC battery characterization with proper coulomb counting; outputs an OCV table and physics-based ECM parameters."
year: 2025
last_active: "2025-09"
language: "Python"
code_bytes: 48722269
archived: false
tags: [battery, python, data-only]
---

hppc_analysis processes HPPC (Hybrid Pulse Power Characterization) test data into a complete OCV table and physics-based equivalent-circuit-model parameters. Coulomb counting drives a 19-point OCV curve from 5–95% SOC, with realistic resistance ranges (1–100 mΩ) and fixed time constants (τ₁=5 min, τ₂=25 min) across 64 cycles. Output is a ready-to-use JSON battery configuration consumed downstream by simulation and modeling code; repo size is mostly bundled HTML reports.
