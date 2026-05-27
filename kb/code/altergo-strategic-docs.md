---
name: "altergo-strategic-docs"
role: author
visibility: private
description: "Private Markdown workspace for Altergo's Adani due-diligence, commercial proposal, and value-delivery docs."
year: 2025
last_active: "2026-02"
code_bytes: 0
archived: false
tags: [docs, battery, energy]
---

altergo-strategic-docs is a Markdown-only working repo for the Altergo × Adani engagement — three-workshop due-diligence plans, commercial framework versions, the strategic purchase proposal, and a value-delivery library covering usable-capacity, life-extension, availability, and O&M-cost mechanisms with a quantification framework. Also holds the platform overview (Digital Twin, Battery Intelligence, ESS/UPS) and the BESS-software RFQ response. Not deployable code; private artefacts from a client engagement.

## What
Nineteen Markdown files organised into four folders: `due-diligence/` (Adani DD
plan, extended DD with IP scope and code-access constraints, a Mermaid process
diagram, an example DD), `value-delivery/` (the four mechanism chapters and
their quantification framework), `commercial/` (proposal + v1/v2 of the
commercial framework), and `platform/` (Altergo overview, BESS RFQ response,
usable-capacity KPI framework). `INDEX.md` is the single entry point.

## Tech
Plain Markdown with one architecture diagram (`altergo_archi.png`) and
embedded Mermaid for the DD-process flow. No build, no tooling. Versioning is
via git history (`_v2` suffix on the commercial framework rather than branches).

## Status
Live 2025, last touched 2026-02. Used internally as the working artefact set
for the Adani engagement — DD workshops, commercial negotiation, RFQ response.
Private repo; not for redistribution.
