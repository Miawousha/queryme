---
name: "altergo-strategic-docs"
role: author
visibility: private
description: "Espace Markdown privé pour la due diligence Adani d'Altergo, la proposition commerciale et les docs value-delivery."
year: 2025
last_active: "2026-02"
code_bytes: 0
archived: false
tags: [docs, battery, energy]
---

altergo-strategic-docs est un dépôt de travail en Markdown pour la mission Altergo × Adani — plans de due diligence sur trois ateliers, versions du cadre commercial, proposition de partenariat stratégique, et bibliothèque value-delivery couvrant les mécanismes de capacité utile, d'extension de durée de vie, de disponibilité et de réduction des coûts O&M avec un cadre de quantification. Contient aussi la présentation plateforme (Digital Twin, Battery Intelligence, ESS/UPS) et la réponse à l'appel d'offres logiciel BESS. Pas de code déployable ; livrables privés d'une mission client.

## What
Dix-neuf fichiers Markdown organisés en quatre dossiers : `due-diligence/`
(plan DD Adani, DD étendu avec périmètre IP et contraintes d'accès au code,
diagramme de processus Mermaid, exemple de DD), `value-delivery/` (les quatre
chapitres de mécanismes et leur cadre de quantification), `commercial/`
(proposition + v1/v2 du cadre commercial), et `platform/` (vue d'ensemble
Altergo, réponse RFQ BESS, cadre KPI capacité utile). `INDEX.md` est le point
d'entrée unique.

## Tech
Markdown brut avec un schéma d'architecture (`altergo_archi.png`) et du
Mermaid embarqué pour le flux DD. Pas de build, pas d'outillage. Versioning par
historique git (suffixe `_v2` sur le cadre commercial plutôt que des branches).

## Status
Vivant en 2025, dernière modif 2026-02. Utilisé en interne comme jeu de
livrables de travail pour la mission Adani — ateliers DD, négociation
commerciale, réponse RFQ. Dépôt privé ; pas pour redistribution.
