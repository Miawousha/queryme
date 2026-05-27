---
name: "sop"
url: https://github.com/ION-Altergo/sop
role: contributor
visibility: private
description: "State-of-Power — courant max soutenable en charge/décharge sur un horizon 1–10 min, Thevenin + ECM."
year: 2025
last_active: "2025-09"
language: "Python"
code_bytes: 52763
archived: false
tags: [battery, python, simulation]
---

sop est le modèle State-of-Power de la plateforme jumeau numérique Altergo — sur un horizon configurable de 1 à 10 minutes, il calcule le courant maximal que le pack peut soutenir en charge et en décharge avant de buter sur une limite de tension, courant, puissance, SoC ou température. La physique est une relation Thevenin `V = OCV ± I*R` imposée au SoC de fin d'horizon, avec tables OCV(SoC,T) et R(SoC,T) en interpolation bilinéaire, ECM optionnel à 3-RC donnant `R_eff(τ) = R0 + Σ Rᵢ(1 − exp(−τ/τᵢ))` avec mise à l'échelle en SoC, température et SoH, plus les caps PCS en kW projetés en courants équivalents et des gates SoC en base coulomb ou énergie. Bâti sur le scaffold model-boilerplate, partage le dépôt avec un modèle `eq_cycles`.

## What
Émet quatre séries : `sop_continuous_discharge_kw`, `sop_continuous_charge_kw`, `sop_continuous_net_kw` (décharge positif, charge négatif), et un entier `sop_limiter_code` dont le signe et la valeur identifient quelle contrainte est active à chaque instant (±1 tension, ±2 courant matériel, ±3 puissance PCS, ±4 fenêtre SoC, ±5 thermique, ±6 table de sécurité, 0 = non borné). Les consommateurs sont des systèmes EMS et des optimiseurs de dispatch qui ont besoin de savoir "combien de kW puis-je offrir au réseau dans les 5 prochaines minutes" sans risquer de déclencher une limite. Le modèle `eq_cycles` livré dans le même dépôt est sans rapport : il intègre `|I|*dt / (2*capacity)` en cycles équivalents avec compensation optionnelle de rendement et de SoH.

## Tech
`models/sop/sop.py` est un `StateOfPowerModel(Model)` d'environ 2000 lignes. À chaque timestamp il : (1) interpole `OCV_now`, `R_now` depuis les tables bilinéaires OCV(SoC,T) et R(SoC,T), (2) exécute `iterations` (défaut 2) passes de point fixe sur `SOC_end = SOC_now ± I*τ/(3600*capacity)` pour converger vers l'OCV de fin d'horizon, (3) résout l'équation tension contraignante `V_min = OCV_end - I*R_eff(τ)` pour le courant de décharge et `V_max = OCV_end + I*R_eff(τ)` pour la charge, (4) prend le min/max contre les caps courant matériels, la série de limite courant thermique, les caps PCS en kW (convertis par `I = P/V`), et les caps de fenêtre SoC issus de gates coulomb ou énergie. La voie optionnelle `ecm_enable` construit `R_eff(τ) = R0 + Σᵢ Rᵢ*(1 − exp(−τ/τᵢ))` en 1-, 2- ou 3-RC, avec chaque `Rᵢ` mis à l'échelle par facteur SoC × facteur température × `(1 + soh_coeff*(1-SoH))`. Une table `sop_safety_enable` permet aux opérations d'appliquer un derate multiplicatif 0–1 par cellule (SoC, T). L'entrypoint fait 13 lignes : `execute_altergo_models(...)` depuis le boilerplate, comme `soc`.

## Status
Modèle en production depuis 2025. Utilisé par les consommateurs EMS / dispatch qui ont besoin de l'enveloppe d'exploitation prédite ; le code de limiteur permet aux dashboards d'expliquer *pourquoi* un pack ne peut pas délivrer plus (contrainte active exposée, pas seulement écrêtée). Dépôt dernier commit 2025-09, version 1.1.0. Le modèle co-résident `eq_cycles` est en v2.1, faible coût de calcul, utilisé pour le suivi durée de vie / garantie sur budgets de cycles équivalents.
