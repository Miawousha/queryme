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

## What
Walks a developer through what an Altergo "model"-flavoured function looks like end to end: SDK client init, `assetId` and `programTaskId` lookup, parameter extraction, a trivial algorithm class, side-effect output, and registering a "Visualize C-Rate" task result so the platform UI gets a clickable link back to the asset's data. Two empty siblings (`my_model.py`, `model-validation.json`) sit alongside as slots a real model would fill.

## Tech
`my_soc.py` is a `SOC(capacity, SOC)` class with one `update_SOC(current, dt)` method — `delta_SOC = current*dt/capacity*100; SOC -= delta_SOC; clamp at 0`. No upper clamp, no temperature, no OCV correction, no charge-direction handling. `entrypoint.py` builds the SDK client from `apiKey`/`factoryApi`/`iotApi`, writes `hello.txt`, fetches the task by id, sets `task.output = [{name, icon, description, url}]` pointing at `/assets`, and calls `updateTask`. README is the template's "how to use this template" instructions.

## Status
Last touched 2024-10. Used as the canonical teaching example for new platform developers — paired with `simple-app` to show both function flavours. Not deployed; the real SoC implementation moved to `soc-model` (2024) and then `soc` (2025).
