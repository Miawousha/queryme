---
name: "demo-eq-cycle-model"
url: https://github.com/ION-Altergo/demo-eq-cycle-model
role: contributor
visibility: private
description: "Compteur de cycles équivalents pour une trace de courant batterie — débit en Ah divisé par 2× la capacité nominale."
year: 2025
last_active: "2025-09"
language: "Python"
code_bytes: 2793
archived: false
tags: [battery, python, demo]
---

demo-eq-cycle-model est une petite démo Python qui calcule les cycles équivalents cumulés à partir d'une série temporelle de courant batterie : `eqCycles = cumsum(|I|·dt) / (2·Cnom)`. L'estimateur vit dans `tools/eq_cycle_estimator.py` ; `main.py` charge un CSV d'exemple, l'exécute pour une capacité nominale de 56 Ah, et trace eqCycles aux côtés de la tension avec Plotly. Démo autonome de la formule de cycles équivalents — pas déployée sur la plateforme, aucun appel au SDK Altergo.

## What
L'estimateur prend un DataFrame indexé par timestamp avec une colonne `Current`, calcule `time_diff` en heures à partir des valeurs d'index consécutives, multiplie par `|Current|` pour obtenir le débit en Ah par pas, divise par `2·Cnom` pour convertir les Ah en cycles complets équivalents, et retourne la somme cumulée. Le fichier `someCycleData.csv` fourni est une trace de cellule unique codée en dur ; exécuter `main.py` ouvre un graphique Plotly interactif avec eqCycles sur l'axe gauche et Voltage sur l'axe droit.

## Tech
Pandas + numpy + Plotly purs — 2,8 ko de code au total. Pas de SDK Altergo, pas de fichier de configuration, pas de scaffold d'entrypoint. La convention `Ah / (2·Cnom)` (comptage demi-cycle dans les deux sens) correspond à la formule utilisée en aval dans `effective-capacity-benchmark-model` et `hppc_analysis`.

## Status
Exemple pédagogique illustrant la formule eqCycles isolée, écrit en 2025 en marge du travail plus large sur les jumeaux numériques de batterie. Pas déployé, pas maintenu comme produit ; utilisé comme extrait de référence pour expliquer le comptage de cycles à d'autres ingénieurs ou parties prenantes.
