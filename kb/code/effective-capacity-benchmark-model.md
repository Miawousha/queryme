---
name: "effective-capacity-benchmark-model"
url: https://github.com/ION-Altergo/effective-capacity-benchmark-model
role: contributor
visibility: private
description: "Altergo function-template stub wired for an equivalent-cycles sensor — entrypoint never computes."
year: 2024
last_active: "2024-10"
language: "Python"
code_bytes: 1017
archived: false
tags: [battery, python, demo]
---

effective-capacity-benchmark-model is an Altergo function-template scaffold: `entrypoint.py` extracts platform arguments, initializes the SDK client, and fetches the asset by ID — then stops. The `altergo-settings.json` declares it as a "Performance" model reading a `Current` sensor + `Capacity` parameter and writing an `Equivalent Cycles` output, but the actual benchmark logic is missing. Placeholder / unfinished scaffold despite the name.
