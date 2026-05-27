---
name: "matrice-website"
role: author
visibility: private
description: "Matrice's marketing site plus an invite-only private app — Next.js 16 + Supabase, Playwright and Vitest covered."
year: 2026
last_active: "2026-05"
language: "TypeScript"
code_bytes: 110630
archived: false
tags: [nextjs, react, typescript]
---

matrice-website is the Matrice public site plus an invite-only private layer. The marketing surface is a single-file themable landing built on Next.js 16, React 19, Tailwind 4, and Base UI; behind it sits an `/app` area gated by Supabase auth with a hardened invite flow — `profiles` and `invites` tables with strict RLS, a `consume_invite` SECURITY DEFINER function, an admin dashboard for issuing and revoking tokens, and an orphan-cleanup internal API. Covered by Playwright e2e (invite signup) and Vitest unit tests; internal repo for the company.
