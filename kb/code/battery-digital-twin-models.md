---
name: "battery-digital-twin-models"
url: https://github.com/Miawousha/battery-digital-twin-models
role: author
visibility: public
description: "Reference Python models (equivalent-cycle counters) packaged for Altergo's digital-twin runtime."
year: 2025
last_active: "2025-09"
language: "Python"
stars: 0
code_bytes: 37001
archived: false
tags: [battery, energy, python, library]
---

battery-digital-twin-models is a reference Python package showing how to ship battery models for Altergo's digital-twin runtime. Two models ship today: `eq_cycles` (simple coulombic-throughput cycle count) and `adv_eq_cycles` (an LFP-tuned equivalent-cycle counter that weights throughput by sustained C-rate, temperature with a Q10 cyclic factor and low-T charge surcharge, and a smoothstep SOC stress model). Each model subclasses `Model` from the `altergo_sdk` and registers itself via `@register_model`; `entrypoint.py` is a thin wrapper that calls the SDK's `execute_altergo_models` boilerplate. Open-source so model authors can copy the pattern without seeing the SDK internals.

## What
Two pip-installable models the Altergo platform runs against asset time-series.
`eq_cycles` returns cumulative standard equivalent cycles from `current` (Ah
throughput / 2·capacity), with optional coulombic-efficiency correction and
SOH-based capacity compensation. `adv_eq_cycles` (registered as
`enhanced_equivalent_cycles`) returns `std_cycle_count`,
`equivalent_cycle_count`, and `cycle_life_fraction` — the same throughput
weighted by a clamped product of three multipliers (C-rate, temperature, SOC).
Each model directory ships its own `model.json` manifest (logical input/output
names, units, required flags) and a README; debug mode emits an HTML dashboard
of inputs, parameters, and outputs.

## Tech
`@register_model(name, metadata={category, complexity, computational_cost})`
publishes the class to a registry the SDK discovers at execution time —
authors never wire their model into a main loop. Inputs arrive as pandas
Series indexed by `DatetimeIndex`; the model owns its time-base via
`current.index.to_series().diff()`. The advanced model's smoothing is a causal
first-order EMA over irregular `dt`, the SOC stress uses cubic smoothstep
ramps near 80–96 % (LFP-dominant high-SOC penalty) and a weak 2–8 % low-SOC
penalty, temperature applies `Q10^((T-Tref)/10)` with a charge-only
plating-risk surcharge below 15 °C, and the combined multiplier is clamped to
[0.2, 3.0]. `requirements.txt` is pandas + numpy + the private `altergo_sdk`.
Configuration is layered: defaults in code, manifest in `model.json`, runtime
override in `altergo-settings.json`.

## Status
Built and deployed to Altergo customer assets in 2025; last commit 2025-09.
Open-source under the Altergo organisation as the canonical "how to write a
model" example — internal teams and integration partners copy the structure.
Two models in this repo today; the platform runs dozens more from sibling
private repos under the same pattern.
