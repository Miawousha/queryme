# Agent-first KB onboarding — design

**Date:** 2026-06-12
**Status:** Approved

## Problem

A brand-new user who signs up has no guided path to a working knowledge base.
Today the only guidance is a one-line empty state on the admin Content tab
("No persona configured yet — paste a public GitHub repo URL below"), and the
actual spec for the content repo is a 22KB document
([content-repo-guide.md](../../content-repo-guide.md)) that lives in this
repo, unreachable from the app.

The quickest realistic setup path is to let an agentic coding assistant
(Claude Code, Cursor, Codex, …) build the content repo for the user. That path
needs to be both **explained** in the product and **made real** with two small
artifacts: a copy-paste prompt and an agent-fetchable setup guide.

**Success criterion:** a new user with a CV on hand goes from an empty Content
tab to a synced KB and a first answered question in ~15 minutes, without
reading the content-repo guide themselves.

## Decisions taken during brainstorming

- **Scope:** explain the path *and* build the minimal artifacts it depends on.
  No GitHub template repo, no guided multi-tab checklist (those stay in
  Roadmap Phase 4).
- **Placement:** the onboarding lives in the admin Content tab empty state —
  the one surface every new user must reach anyway, and reachable while
  waitlisted.
- **KB source material:** the agent ingests whatever the user has on hand
  (CV PDF, LinkedIn export, portfolio links) and runs a short gap interview to
  capture narrative/stories. Not import-only, not interview-from-scratch.
- **Mechanism (Approach B):** short copy-paste prompt + agent-fetchable guide
  served by the app. Rejected: embedding the full schema in the prompt
  (drift + 20KB of copy) and a GitHub template repo (Phase 4 scope).

## Components

### 1. Agent setup guide at a stable URL

New public route `GET /setup-guide.md` (route handler at
`app/setup-guide.md/route.ts`, responds `200` with
`Content-Type: text/markdown`). The response is a concatenation of two
markdown files shipped with the app:

1. **`docs/agent-setup-preamble.md`** (new, ~1 page) — written to the
   *executing agent*. Contents:
   - Goal: build a Queritae content repo for the user.
   - Workflow: ask the user for source material → scaffold the repo
     structure → fill files, interviewing the user briefly to fill gaps and
     capture stories → self-check every file against the schema reference
     below **before pushing** → create a **public** GitHub repo and push →
     hand off: tell the user to paste the repo URL into their admin Content
     tab and click Sync, and to paste any sync error back into this session.
   - Constraint stated up front: the repo must be public (sync fetches the
     tarball unauthenticated).
2. **`docs/content-repo-guide.md` verbatim** — the schema reference. Single
   source of truth: the guide ships with the deployed app, so what agents
   fetch cannot drift from the deployed Zod validation
   (`lib/kb/schemas.ts`).

The same URL doubles as the human-readable guide for users who want to write
the repo by hand.

Deployment note: the route reads both files from `docs/` at request time, so
they must be included in the serverless bundle (Next
`outputFileTracingIncludes` or equivalent).

### 2. Copy-paste prompt

Rendered in the Content tab empty state with a copy button. ~6 lines.
`{username}` interpolated from the session; the guide URL built from the
request origin so it works on localhost, preview deploys, and custom domains.

> I'm setting up my Queritae knowledge base — a queryable CV that will live
> at queritae.com/**{username}**. Fetch https://queritae.com/setup-guide.md
> and follow it exactly. Ask me for my source material (CV, LinkedIn export,
> portfolio links), and interview me briefly to fill gaps and capture
> stories. When everything passes the guide's self-checks, create a public
> GitHub repo, push, and give me the URL to paste into my Queritae admin.

### 3. Guided empty state on the Content tab

Replace the one-line empty state in
[content-tab.tsx](../../../components/admin/content-tab.tsx) with a
three-step layout:

1. **Copy this prompt** into Claude Code — or any coding agent that can
   fetch a URL and push to GitHub. (Prompt block + copy button.)
2. **The agent builds your content repo** from your CV plus a short
   interview, and pushes it to GitHub (public).
3. **Paste the repo URL below and Sync.** If sync fails, paste the error
   back into your agent.

Secondary link for the manual path: "Prefer to write it by hand? Read the
setup guide." → `/setup-guide.md`.

The existing URL+branch form remains as step 3's action. Once the first sync
succeeds, the stepper gives way to the existing active-source view (current
behavior). The whole flow works while the account is waitlisted, so users can
prepare content before approval.

## Error handling

- Sync/validation errors already render in the Content tab; the step-3 copy
  makes the repair loop explicit (paste error → agent fixes → push →
  re-sync).
- The preamble instructs the agent to self-check files against the schemas
  before pushing, so most users should never see a validation error.
- Private repo is the most likely hard failure; the guide and preamble call
  out the public-repo requirement explicitly.

## Testing

- **Unit:** `/setup-guide.md` returns 200 `text/markdown` whose body contains
  both the preamble heading and known schema headings from the content-repo
  guide.
- **Component:** the empty state renders the prompt with the username
  interpolated and the origin-correct guide URL; the copy button copies the
  full prompt.
- **Dogfood smoke test (manual):** run the prompt in Claude Code against a
  fresh test account, end to end — agent builds repo, sync succeeds, first
  question answered.

## Out of scope

- GitHub template repo and CV importer (Roadmap Phase 4).
- Per-account MCP endpoints or MCP setup tools.
- Onboarding emails; changes to the waitlist/approval flow.
- Any extension of the deprecated sensitive/unlock path.
