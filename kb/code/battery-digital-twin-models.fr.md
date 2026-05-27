---
name: "battery-digital-twin-models"
url: https://github.com/Miawousha/battery-digital-twin-models
role: author
visibility: public
description: "Modèles Python de référence (compteurs de cycles équivalents) packagés pour le runtime jumeau numérique d'Altergo."
year: 2025
last_active: "2025-09"
language: "Python"
stars: 0
code_bytes: 37001
archived: false
tags: [battery, energy, python, library]
---

battery-digital-twin-models est un package Python de référence qui montre comment livrer des modèles batterie pour le runtime jumeau numérique d'Altergo. Deux modèles aujourd'hui : `eq_cycles` (comptage simple de cycles via le débit coulombique) et `adv_eq_cycles` (un compteur de cycles équivalents calibré LFP qui pondère le débit par le C-rate soutenu, la température via un facteur Q10 cyclique et une surtaxe charge basse température, et un modèle de stress SOC en smoothstep). Chaque modèle hérite de `Model` du `altergo_sdk` et s'enregistre via `@register_model` ; `entrypoint.py` est un wrapper mince qui appelle le boilerplate `execute_altergo_models` du SDK. Open-source pour que les auteurs de modèles puissent copier le patron sans toucher aux entrailles du SDK.
