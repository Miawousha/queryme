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
