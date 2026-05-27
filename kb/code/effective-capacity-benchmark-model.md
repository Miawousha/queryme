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

## What
The repo name suggests an effective-capacity benchmark (measured Ah vs nominal as a SOH indicator), but the declared I/O is equivalent cycles, not capacity. The mismatch and the empty body together signal this is a scaffold that was filed under a working title and never finished. As-is, running it does nothing useful: it just authenticates against Altergo and pulls an asset reference.

## Tech
Uses `extract_altergo_parameters()` and `Client(functionArguments=altergoArguments)` from `altergo_sdk` to handle credentials, factory/IoT API URLs, and the `assetId` injected by the platform at execution time. The `altergo-settings.json` schema follows the older single-model `bp_sensors` / `bp_parameters` style (pre-dating the multi-model `enabled_models` registry used in the `impedance` repo). 1 kB of Python, three imports, no computation.

## Status
Created 2024, untouched since. Predates the boilerplate-based pattern (`AltergoModelBoilerplate`) that the `impedance` repo standardized on. Effectively dead code in the ION-Altergo org — either to be repurposed as a real effective-capacity model or deleted.
