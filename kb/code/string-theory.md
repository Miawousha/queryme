---
name: "string-theory"
role: author
visibility: private
description: "Quest-based guitar skill platform with explicit done-when checkpoints, XP, and interactive tabs."
year: 2026
last_active: "2026-02"
language: "JavaScript"
code_bytes: 3527238
archived: false
tags: [education, nextjs, react]
---

string-theory is a quest-based guitar-skill platform built on Next.js 16, Prisma + Neon Postgres, and NextAuth v5 (credentials with the Prisma adapter). The Prisma schema models a `Quest → Session → Exercise` hierarchy where every quest tags one of six domains (TIME, TECHNIQUE, FRETBOARD, HARMONY, EAR, IMPROV) and carries an XP reward plus comma-separated prerequisites; each exercise carries its own `doneCriteria`, a duration, an optional YouTube clip, and JSON configs for an in-house fretboard widget, an alphaTab notation viewer, and pitch-detection exercises powered by `pitchy`. shadcn/ui + Tailwind 4 frontend, Playwright in place for end-to-end.
