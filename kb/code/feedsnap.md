---
name: "feedsnap"
role: author
visibility: private
description: "Feedback and tasking infrastructure: humans and agents submit signal, clusters become prioritized tickets."
year: 2026
last_active: "2026-05"
language: "TypeScript"
code_bytes: 397827
archived: false
tags: [productivity, ai, nextjs, typescript, postgres]
---

feedsnap is a feedback and tasking data infrastructure: humans and agents submit signal through a widget, CLI, or JSON API, and the system clusters, scores, and emits prioritized tickets. Built on Next.js with Postgres + pgvector for storage and clustering, plus a dashboard and outbound webhooks for downstream consumers. Source-available under BSL 1.1 (converts to Apache-2.0 in 2029); pre-1.0 with a stable `/api/v1`.
