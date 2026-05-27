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

## What
Deux modèles pip-installables que la plateforme Altergo exécute sur les
séries temporelles d'actifs. `eq_cycles` renvoie le cumul de cycles
équivalents standard à partir de `current` (débit Ah / 2·capacité), avec une
correction optionnelle d'efficacité coulombique et une compensation de capacité
basée SOH. `adv_eq_cycles` (enregistré comme `enhanced_equivalent_cycles`)
renvoie `std_cycle_count`, `equivalent_cycle_count` et `cycle_life_fraction` —
le même débit pondéré par un produit borné de trois multiplicateurs (C-rate,
température, SOC). Chaque dossier modèle livre son propre manifeste
`model.json` (noms logiques entrée/sortie, unités, flags `required`) et un
README ; le mode debug émet un dashboard HTML des entrées, paramètres et
sorties.

## Tech
`@register_model(name, metadata={category, complexity, computational_cost})`
publie la classe vers un registre que le SDK découvre à l'exécution — les
auteurs ne câblent jamais leur modèle dans une main loop. Les entrées
arrivent en `pandas.Series` indexées par `DatetimeIndex` ; le modèle possède
sa propre base de temps via `current.index.to_series().diff()`. Le lissage du
modèle avancé est une EMA causale du premier ordre sur un `dt` irrégulier ; le
stress SOC utilise des rampes en cubic smoothstep autour de 80–96 % (pénalité
haut-SOC dominante LFP) et une rampe faible 2–8 % bas-SOC ; la température
applique `Q10^((T-Tref)/10)` avec une surtaxe risque-plating uniquement en
charge sous 15 °C ; le multiplicateur combiné est borné à [0.2, 3.0].
`requirements.txt` se réduit à pandas + numpy + le `altergo_sdk` privé. La
configuration est en couches : défauts dans le code, manifeste dans
`model.json`, override runtime dans `altergo-settings.json`.

## Status
Construit et déployé sur des actifs clients Altergo en 2025 ; dernier commit
2025-09. Open-source sous l'organisation Altergo comme exemple canonique du
« comment écrire un modèle » — les équipes internes et partenaires
d'intégration copient la structure. Deux modèles dans ce dépôt aujourd'hui ;
la plateforme en exécute des dizaines d'autres depuis des dépôts privés
voisins suivant le même patron.
