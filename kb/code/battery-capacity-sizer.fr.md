---
name: "battery_capacity_sizer"
url: https://github.com/ION-Altergo/battery_capacity_sizer
role: contributor
visibility: private
description: "Dimensionne la capacité batterie pour un profil de charge donné, assemblé à partir de PCU, containers, transformateurs et appareillage."
year: 2025
last_active: "2025-09"
language: "Python"
code_bytes: 598726
archived: false
tags: [battery, energy, python, optimization]
---

battery_capacity_sizer calcule la capacité nécessaire d'un système batterie pour un profil de charge donné, en assemblant la réponse à partir de modèles au niveau composant — containers batterie, unités PCU, transformateurs, appareillage et un mini-modèle de SoH. Organisé en `assemblies/` au-dessus de `components/` au-dessus de `requirements/`, pour que le profil de charge pilote le dimensionnement à travers un modèle en couches plutôt qu'une formule fermée. Outil interne utilisé pour spécifier des installations BESS.
