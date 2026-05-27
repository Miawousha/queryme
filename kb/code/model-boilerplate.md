---
name: "model_boilerplate"
url: https://github.com/ION-Altergo/model_boilerplate
role: contributor
visibility: private
description: "Reference scaffold for building battery digital-twin models against the Altergo SDK."
year: 2025
last_active: "2025-12"
language: "Python"
code_bytes: 69319
archived: false
tags: [battery, python, library]
---

model_boilerplate is the canonical Python scaffold for building battery digital-twin models on the Altergo platform. Wraps the Altergo SDK's `AltergoModelBoilerplate` lifecycle (prepare data, execute, debug dashboards, upload output) into a `entrypoint_simple.py` / `entrypoint_advanced.py` pair, with a `models/` registry pattern (decorator-registered classes plus per-model `model.json` manifest) and four worked examples — `eq_cycles`, `adv_eq_cycles`, `soc_eq_cycles`, `rainflow_cycles`. Internal foundation that new models (SoC, SoH, impedance, cell imbalance, etc.) fork instead of recreating SDK plumbing.

## What
Inputs are an Altergo asset plus a JSON-declared list of sensor series (current, voltage, temperature, SoC); outputs are new sensor time series uploaded back to the same asset. `altergo-settings.json` selects which models run (`enabled_models`), how data is fetched (`compute_type`, `max_days_period_compute`), and whether to render debug Plotly dashboards or push results. Consumed by Altergo workers in production and by model authors locally via `dev-parameters.json` credentials.

## Tech
`entrypoint_simple.py` is one-liner: `AltergoModelBoilerplate(extract_altergo_parameters()).execute()`. `entrypoint_advanced.py` splits the lifecycle into `prepare_models_data` / `execute_models` / `show_debug_dashboards` / `upload_models_output` so authors can inject custom inputs between phases. Each model under `models/<name>/` subclasses `altergo_sdk.boiler_plate.Model`, registers with `@register_model(name, metadata=...)`, declares its I/O contract in `model.json`, and implements `process(data) -> dict`. The four shipped examples cover equivalent-cycle counters and a rainflow cycle counter — concrete references for new contributors. Tests live under each model's `tests/` folder.

## Status
Active reference scaffold across the ION-Altergo battery model fleet as of 2025-12. Maintained by the platform team; individual model repos (rtbm, custom client models) all fork this layout. Contributor role — Alexandre extended example models and the registry pattern while building rtbm and the dataset generator on top.
