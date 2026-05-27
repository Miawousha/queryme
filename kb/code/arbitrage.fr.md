---
name: "arbitrage"
url: https://github.com/ION-Altergo/arbitrage
role: contributor
visibility: private
description: "MILP d'arbitrage BESS pour le planning day-ahead, complété d'une couche d'ajustement temps réel pilotée par les prix RT/LMP."
year: 2025
last_active: "2025-06"
language: "Python"
code_bytes: 40245694
archived: false
tags: [battery, energy, python, optimization]
---

arbitrage optimise le trading d'un Battery Energy Storage System sur les marchés day-ahead et temps réel. `bess_arbitrage_optimizer.py` formule un MILP en PuLP sur un horizon de 24 h, à un pas de 15, 30 ou 60 minutes, avec des variables continues de puissance de charge/décharge et d'état d'énergie, des variables binaires d'état (charging / discharging / idle / soak — exactement une active par période), une fenêtre de "soak" d'environ 2 h au-dessus d'un SoC minimum, des plafonds de cycles équivalents complets par jour, des limites de puissance dépendantes de la SOE (interpolées à partir de tableaux), un rendement aller-retour et un retour imposé à la SOE initiale. `realtime_bess_optimizer.py` consomme ensuite le planning produit et décide de suivre, dévier ou couper en urgence en fonction de l'écart RT/DA, des limites de déviations consécutives, d'une marge de sécurité sur les FCE, du coût de transaction et des bornes de SOE. Des chargeurs pour le DAM indien et des exporteurs de plannings EMS/SCADA cohabitent ; les 40 Mo du dépôt sont surtout du HTML Plotly embarqué.

## What

Deux optimiseurs couplés qui permettent à un opérateur BESS de (a) planifier un planning charge/décharge profitable pour le lendemain face à une courbe de prix day-ahead, et (b) réagir intelligemment quand les prix temps réel divergent de ces hypothèses au cours de la journée. Le day-ahead répond à « à quoi doit ressembler le planning de demain ? » ; le temps réel répond à « avec le prix que je vois maintenant, est-ce que je suis le plan, je dévie, ou j'arrête ? ». Les sorties incluent un planning JSON compatible EMS/SCADA, un Excel détaillé du revenu, et des dashboards Plotly HTML.

## Tech

Le day-ahead est un vrai MILP (pas un LP continu) — `pulp.LpVariable.dicts(..., cat='Binary')` sur `state_charging`, `state_discharging`, `state_idle`, `state_soak` avec la contrainte d'exclusion mutuelle par période `state_charging[t] + state_discharging[t] + state_idle[t] + state_soak[t] == 1`. La physique batterie est encapsulée dans un `@dataclass BatteryConstraints` avec `max_fce_per_day`, `soak_duration_hours`, `min_soak_soc`, `aux_capacity_loss_rate`, et des tableaux de limites de puissance indexés en SOE, interpolés via `_interpolate_power_limits`. Le contrôle temps réel est une machine à états avec un enum `DeviationDecision` (`FOLLOW_SCHEDULE`, `DEVIATE_CHARGE`, `DEVIATE_DISCHARGE`, `DEVIATE_IDLE`, `EMERGENCY_STOP`) verrouillé par `max_consecutive_deviations`, une marge de sécurité FCE et un coût de transaction configurable. Des CSV DAM indiens (15 min et horaire) sont livrés pour la reproductibilité ; les exporteurs EMS/SCADA produisent le schéma JSON documenté dans `EMS_SCHEDULE_FORMAT.md`.

## Status

Projet actif en 2025, écrit en contributeur dans ION-Altergo. Le dépôt porte des traces de production — `production_schedule.json`, `production_rt_decisions.json`, `realtime_decisions_log.json` — il a donc été poussé sur de vrais plannings, pas seulement en notebook. Les 40 Mo viennent quasi entièrement des rapports Plotly HTML pré-bundlés pour des scénarios commerciaux/client (volatilité haute/moyenne/basse, pas 15/30/60 min), pas du code. Les tests couvrent les contraintes FCE, l'imposition du soak, la gestion des intervalles et la logique de décision temps réel.
