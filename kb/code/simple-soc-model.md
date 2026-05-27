---
name: "simple_soc_model"
url: https://github.com/ION-Altergo/simple_soc_model
role: contributor
visibility: private
description: "Teaching scaffold — Altergo function-template with a trivial coulomb-counting SoC class."
year: 2024
last_active: "2024-10"
language: "Python"
code_bytes: 2683
archived: false
tags: [battery, python, demo]
---

simple_soc_model is the Altergo function-template scaffold with a placeholder SoC algorithm — `my_soc.py` is a 10-line class that decrements SoC by `current * dt / capacity * 100` (basic coulomb counting, no OCV, no temperature, no error bounds). `entrypoint.py` wires it into the SDK, writes a `hello.txt`, and registers a task output. Teaching example for the function-template structure, not a real estimator.
