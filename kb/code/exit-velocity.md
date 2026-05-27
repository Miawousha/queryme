---
name: "exit_velocity"
role: author
visibility: private
description: "Pseudonymous intake funnel for founders quietly exploring exit options."
year: 2026
last_active: "2026-01"
language: "TypeScript"
code_bytes: 121412
archived: false
tags: [nextjs, react, typescript, fintech]
---

exit_velocity is a Next.js 15 intake funnel that lets founders confidentially evaluate an exit. The flow is strict: enter an email, get assigned a celestial pseudonym (e.g. "Crimson Vega") backed by a globally-unique reservation in Postgres, click the verification link within 48 hours, then answer six questions in a 15-minute timed session — no drafts, no re-submissions. Built with shadcn/ui, Vercel Postgres, Resend for verification + admin notifications, and Zustand for the timer; every verified submission triggers a manual review by the owner.
