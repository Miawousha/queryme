---
name: "travelbook"
url: https://github.com/ION-Altergo/travelbook
role: contributor
visibility: public
description: "Engineering trip planner prototype — Next.js 16, NextAuth Google, shadcn/ui, in-memory data."
year: 2025
last_active: "2025-12"
language: "TypeScript"
stars: 0
code_bytes: 198654
archived: false
tags: [nextjs, react, typescript, productivity, b2b-saas]
---

travelbook is an internal-tool prototype for planning on-site engineering trips at ION-Altergo — engineers, trips, expenses, availability, and customer-facing reports across day/week/month/quarter/year timelines. Built with Next.js 16, React 19, NextAuth v5 (Google provider only, gating every non-login route via the `authorized` callback), Tailwind 4, and shadcn/ui on a Linear-inspired surface. There is no backend yet: data lives in `lib/data.ts` sample arrays surfaced through a React `data-context.tsx`, expenses default to EUR with multi-currency only modeled in the type, and the only API route is NextAuth itself. Prototype-stage, not deployed; public on the org's GitHub.

## What
Five top-level routes under `app/`: a dashboard (`page.tsx`) with stats cards and an aggregated timeline of who's where, `trips/` for plan/confirm/in-progress/complete trip lifecycle with a `trip-dialog` modal, `engineers/` for per-engineer days-on-site and revenue estimates, `expenses/` for category-tagged spend linked to trips, and `reports/` to generate monthly/quarterly/yearly customer-facing breakdowns. Sidebar components (`availability-sidebar`, `expense-sidebar`, `trip-sidebar`) provide drill-in detail; a single `data-context` provider holds all in-memory state.

## Tech
Next.js 16 App Router + React 19 + TypeScript; styling on Tailwind 4 with shadcn/ui components under `components/ui/`. Auth via `auth.ts` + `auth.config.ts`: NextAuth v5 with Google as the only provider, an `authorized` callback that returns `false` for any unauthenticated request outside `/login` (Edge middleware in `middleware.ts` enforces it), and a `session` callback that extracts the email domain to enable team-by-domain scoping. No database — `lib/data.ts` holds engineers / trips / expenses / availabilities as typed arrays; `contexts/data-context.tsx` exposes them through React Context. Expense type carries an `amount` plus a `currency` enum (EUR/USD/INR/GBP) but the UI defaults everything to EUR. Only API route is `app/api/auth/[...nextauth]`. The repo carries a thick stack of `UPDATES_V*.md` notes documenting the iterative additions (auth, team members, style fixes, availability, CRUD consistency).

## Status
Prototype, last active December 2025, not deployed. Sits on the ION-Altergo public GitHub as a UI/UX exploration of what the planning tool could look like — the data model and screens are real, the persistence layer is the obvious next step. No active users; superseded conceptually by other internal tools.
