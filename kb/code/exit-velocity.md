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

## What

The six questions are deliberate: product-market fit (yes/maybe/not yet), revenue band ($0–1M / $1–10M / $10M+), willingness to consider a transaction this quarter, role (founder/employee/investor/advisor/other), a company snapshot (≥50 chars), and a strategic reflection (≥50 chars). The home page sells the proposition ("Privately evaluate strategic exit options — confidential by design, no tracking, no cookies"); `/insights` ships three MDX articles (signals of readiness, the quiet exit, thinking about valuation) for SEO and trust. After verification, the form mounts behind a fixed badge counting down from 15 minutes; expiry replaces the form with a "the window has ended — nothing has been saved" card.

## Tech

Pseudonyms come from a curated pool — 110-ish muted modifiers (Ash, Slate, Onyx, Sepia…) crossed with 130-ish celestial names (Vega, Orion, Lyra, Nebula…), weighted 80% common / 20% rare, drawn with `crypto.randomInt` and guarded against grandiose tokens (Alpha, Ultra, Divine). Uniqueness is enforced by inserting into a `pseudonyms` table with a unique constraint and retrying up to 50 times on `23505`; the generator logs a warning past 80% capacity. Verification tokens (nanoid) live on the session row; Resend sends both the user-facing magic link and a templated admin notification with `replyTo` set to the founder's real email, so the operator can reply without ever leaving the inbox. Form validation is Zod + react-hook-form; the Zustand timer ticks via a `setInterval` and the submit button disables when it hits zero.

## Status

Live at exitvelocity.me, deployed on Vercel. Operated solo by the owner; every submission is reviewed by hand and answered from the admin's inbox — there is no triage queue, no scoring, no CRM. Last meaningful activity January 2026. The constraint is intentional: the product can't scale past one operator without changing what it is.
