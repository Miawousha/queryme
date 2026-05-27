---
name: "feedsnap"
role: author
visibility: private
description: "Infrastructure de feedback et de tickets : humains et agents soumettent du signal, les clusters deviennent des tickets priorisés."
year: 2026
last_active: "2026-05"
language: "TypeScript"
code_bytes: 397827
archived: false
tags: [productivity, ai, nextjs, typescript, postgres]
---

feedsnap est une infrastructure de feedback et de tickets : humains et agents soumettent du signal via un widget, une CLI ou une API JSON, et le système les regroupe, les score et émet des tickets priorisés. Construit sur Next.js avec Postgres + pgvector pour le stockage et le clustering, plus un dashboard et des webhooks sortants pour les consommateurs. Source-available sous BSL 1.1 (bascule en Apache-2.0 en 2029) ; pré-1.0 avec un `/api/v1` stable.
