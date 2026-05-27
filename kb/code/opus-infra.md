---
name: "opus-infra"
role: author
visibility: private
description: "Backing infra for OPUS — manuscripts as typed, claim-level objects with AI + human peer review."
year: 2026
last_active: "2026-05"
language: "TypeScript"
code_bytes: 385027
archived: false
tags: [ai, nextjs, typescript, postgres]
---

opus-infra is the Next.js 16 + Supabase application backing OPUS, a scientific journal that treats manuscripts as typed objects rather than PDFs — versioned content, claim extraction (contribution / result / method / limitation with evidence and citation refs), and a status workflow that moves a submission from draft through AI rubric review, reviewer matching, human review and consensus, to greenlit or declined. AI review and claim extraction both call Claude (`claude-opus-4-7`) via the Anthropic SDK with tool-use; the editor renders markdown + KaTeX and version diffs. Vitest integration tests cover the article, review, AI-review, claims, and admin oversight surfaces. Private, early but substantively wired beyond a stub.
