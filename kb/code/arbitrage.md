---
name: "arbitrage"
url: https://github.com/ION-Altergo/arbitrage
role: contributor
visibility: private
description: "BESS arbitrage MILP for day-ahead schedules plus a real-time deviation layer driven by RT/LMP prices."
year: 2025
last_active: "2025-06"
language: "Python"
code_bytes: 40245694
archived: false
tags: [battery, energy, python, optimization]
---

arbitrage optimises Battery Energy Storage System trading against day-ahead and real-time power markets. `bess_arbitrage_optimizer.py` formulates a MILP in PuLP over a 24 h horizon at 15-, 30- or 60-minute intervals with continuous charge/discharge/SOE variables, binary state variables for charging / discharging / idle / soak (exactly one active per period), an enforced ~2 h soak window above min SoC, FCE-per-day caps, SOE-dependent power limits (interpolated from arrays), round-trip efficiency, and an enforced return to initial SOE. `realtime_bess_optimizer.py` then consumes the resulting schedule and decides whether to follow, deviate, or emergency-stop based on RT vs DA price spreads, consecutive-deviation caps, FCE safety margin, transaction costs and SOE bounds. Indian DAM data loaders and EMS/SCADA schedule exporters live alongside; the bulk of the repo's 40 MB is bundled Plotly HTML.

## What

Two coupled optimisers that together let a BESS operator (a) plan a profitable next-day charge/discharge schedule against a day-ahead price curve, and (b) intelligently react when real-time prices diverge from those assumptions during the day. The day-ahead layer answers "what should the schedule look like for tomorrow?"; the real-time layer answers "given the price I'm seeing now, do I follow the plan, deviate, or stop?" Outputs include an EMS/SCADA-compatible JSON schedule, an Excel breakdown of revenue, and Plotly HTML dashboards.

## Tech

Day-ahead is a true MILP (not a continuous LP) — `pulp.LpVariable.dicts(..., cat='Binary')` over `state_charging`, `state_discharging`, `state_idle`, `state_soak` with a per-period mutual-exclusion constraint `state_charging[t] + state_discharging[t] + state_idle[t] + state_soak[t] == 1`. Battery physics live in a `@dataclass BatteryConstraints` with explicit `max_fce_per_day`, `soak_duration_hours`, `min_soak_soc`, `aux_capacity_loss_rate`, and SOE-keyed power-limit arrays interpolated via `_interpolate_power_limits`. Real-time control is a state machine with a `DeviationDecision` enum (`FOLLOW_SCHEDULE`, `DEVIATE_CHARGE`, `DEVIATE_DISCHARGE`, `DEVIATE_IDLE`, `EMERGENCY_STOP`) gated by `max_consecutive_deviations`, an FCE safety margin, and a configurable transaction cost. Indian DAM CSVs (15 min and hourly) ship with the repo for reproducibility; EMS/SCADA exporters emit the JSON schema documented in `EMS_SCHEDULE_FORMAT.md`.

## Status

Active 2025 project authored as a contributor inside ION-Altergo. The repo carries production traces — `production_schedule.json`, `production_rt_decisions.json`, `realtime_decisions_log.json` — so it has been driven on real schedules, not just notebooks. The 40 MB weight is almost entirely bundled Plotly HTML reports for sales/customer-facing scenarios (high/medium/low volatility, 15/30/60 min intervals) rather than code. Tests cover FCE constraints, soak enforcement, time-interval handling, and real-time decision logic.
