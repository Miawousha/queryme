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
