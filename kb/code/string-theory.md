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

## What

The learner picks a domain, sees the quests they're eligible for (prerequisites resolved against their `UserQuestProgress`), and works through ordered sessions of exercises. Each exercise spells out a `doneCriteria` checkpoint the learner self-attests against, and completing a session bumps `UserSessionProgress`; clearing all sessions completes the quest and credits XP. Exercises can embed a YouTube clip at a specific timestamp, render an alphaTab notation block, light up positions on the fretboard widget, or run a singing/pitch-detection drill against the microphone.

## Tech

Next.js 16 App Router with route groups (`src/app/(app)/{dashboard,quests,sessions,learn,gear,profile}`), server actions in `src/lib/actions.ts`, NextAuth v5 credentials + bcryptjs verified through the Prisma adapter on `@neondatabase/serverless`. Content lives in `content/learn/` as authored markdown imported at build time. The fretboard component is its own workspace package (`packages/fretboard-widget`). `alphatab` renders notation, `pitchy` does autocorrelation pitch detection against `getUserMedia`, the metronome is hand-rolled (`components/metronome.tsx`). Playwright e2e and an `ARCHITECTURE.md` document the decisions.

## Status

Built through early 2026, last commit 2026-02 ("fix: update chord markers and improve CAGED system descriptions"). ~3.5 MB of source, private, single-user. The CAGED-system content (the systematic way to navigate the fretboard) was the last thing being tuned.
