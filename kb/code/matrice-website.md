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

## What

The public flow is `/` (themable single-file landing with a JetBrains-Mono section label system, reveal animations, and a grid background) → `/register?invite=<token>` or `/login`. A token is required to register; without it the user lands on `/invite-required`. After Supabase signs the user up, the server-side flow calls `consume_invite(token, user_id, email)` and only then creates the `profiles` row. Inside `/app` the admin sees `/app/admin` with two server actions — `new-invite-form.tsx` (create invite with optional email pin) and `revoke-button.tsx` (mark revoked) — plus the table of outstanding tokens.

## Tech

Two migrations carry the whole private layer. `20260526120000_init_profiles_invites.sql` creates `profiles` (id ← `auth.users`, role `member|admin`, partial index `where role = 'admin'`, `updated_at` trigger, `is_admin()` SECURITY DEFINER helper to avoid RLS recursion) and `invites` (token unique, email optional pin, `created_by`, `expires_at`, `revoked_at`, `consumed_at`, `consumed_by`). RLS is strict: only `profiles_select_own_or_admin` is exposed to clients; every write goes through service role. `20260526120100_consume_invite_fn.sql` defines `consume_invite(p_token, p_user_id, p_user_email)` as SECURITY DEFINER, atomically marking the invite consumed only if it's unrevoked, unconsumed, unexpired, and (if pinned) the email matches case-insensitively. `/api/internal/cleanup-orphans` purges `auth.users` rows that never completed invite consumption. Playwright e2e (`tests/e2e/invite-signup.spec.ts`) runs the full token → signup → profile-created flow against a local Supabase stack (`tests/setup-local-supabase.sh`); Vitest covers the helper units.

## Status

Internal Matrice repo, active May 2026. Operated by the company; the admin dashboard is for the team to onboard early users one at a time. The marketing landing is the public face; the `/app` layer is what early users actually interact with after accepting an invite. Tests cover the invite path because that's the hot loop right now.
