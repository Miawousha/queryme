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
