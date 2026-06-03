# User Admin Revamp (IA Restructure) — Design

**Date:** 2026-06-03
**Status:** Approved (pending implementation plan)
**Scope:** The **per-account ("user") admin** at `/[username]/admin` — NOT the
super-admin at `/admin`.
**Prep brief:** `docs/superpowers/specs/2026-06-03-user-admin-revamp-prep.md`
(current-state map, IA diagnosis, 3 proposed directions).

## Purpose

Restructure the per-account admin so its shape matches how the owner actually
uses it. This is an **information-architecture pass**: reorganize the navigation,
remove redundant views, group day-to-day *activity* apart from *configuration*,
and leave room for settings to grow. As a companion goal, dissolve the
664-line `admin-dashboard.tsx` monolith into focused modules — the IA change is
the natural moment to split it.

**Not** in this pass: visual/design refresh beyond what the restructure
necessarily touches, brand-new capabilities (only IA *slots* for future
settings), and mobile/responsive (a separate follow-up).

## Design lens — the owner's intent

The owner opens this page to answer one recurring question: **"Who's been
talking to my agent, and is there anything I need to do?"** Two things are
high-value and actionable:

- **Identified interviewers** — a visitor the agent identified (a recruiter /
  hiring manager who revealed themselves). A lead.
- **Unanswered forwarded questions** — something a visitor asked that the agent
  forwarded for a human reply. A to-do that can email the visitor on send.

Raw conversation traffic is lower-signal reference material. Content-source and
custom-domains are set-once, revisit-rarely configuration. The IA must make the
high-value/actionable items impossible to miss, and tuck configuration away
without losing it.

## Decisions

| Decision | Choice |
|---|---|
| **Merge depth** | Merge **Interviewers → Conversations** as a filter segment (an interviewer *is* a conversation with `interviewer != null`). **Keep Questions as its own top-level section** — it's an action queue with a distinct record type, a reply/email interaction, and an "unanswered" urgency state; a badge beats a buried filter chip. |
| **Nav pattern** | **Grouped left rail** (two groups: Activity, Settings). Scales vertically as settings grow (no horizontal tab overflow), groups by concern natively, single nav paradigm. Desktop-only this pass. |
| **Settings model** | **Real, deep-linkable App Router routes** under a shared layout. Settings items are routes in the same left rail under a "Settings" group header (no separate gear/sub-nav). Future settings drop in as new rail rows + routes. |
| **URL state** | Active **section** lives in the route; the **selected record** lives in a search param (`?c=` conversation, `?q=` question). Reload-safe, bookmarkable, shareable. Replaces the per-tab React `selected` map. |
| **Detail panel** | The existing right-hand **slide-over `DetailSidebar` stays** (it already adapts per record type — low-risk reuse). |
| **Unified conversation detail** | Merge today's separate `InterviewerDetail` + `ConversationDetail` into one detail = optional interviewer-identity block **+** transcript. Removes the in-Conversations "Open conversation →" cross-link hop. |
| **Default landing** | `/[username]/admin` → Conversations (All segment). No new "Overview" dashboard — rail badges deliver at-a-glance triage. |
| **API routes** | **Untouched.** This is a front-of-house / routing / data-loading restructure only. |

## Target information architecture

Six flat tabs (Interviewers, Conversations, Questions, Analytics, Content,
Domains) → **3 Activity + 2 Settings**, grouped in a left rail:

```
┌─────────────────────┐
│  queryme · Admin     │   header: logo · account (e.g. "alex") · theme · logout
├─────────────────────┤
│  ACTIVITY            │
│   Conversations  12  │   → /[username]/admin            (default)
│   Questions     • 3  │   → /[username]/admin/questions  (• N unanswered, accent)
│   Analytics          │   → /[username]/admin/analytics
│                      │
│  SETTINGS            │
│   Content source     │   → /[username]/admin/settings/content
│   Custom domains     │   → /[username]/admin/settings/domains
└─────────────────────┘        (+ future slots: Profile, Branding, Notifications, Billing)
```

Rail badges supply triage **before any click**: the Conversations total and the
Questions unanswered-count (rendered in accent). This is why no separate
Overview screen is added.

## Layout & flows

- **Two-pane shell:** persistent left rail + main content area, under the
  existing full-width header. The right-hand `DetailSidebar` slide-over is
  reused for record detail.
- **Conversations** page: a segmented filter **`All · Interviewers`** (each with
  a count) over the conversation list. Channel (chat/mcp) stays a per-row badge.
  Interviewers — the leads — are one prominent click, never buried in a menu.
- **Unified conversation detail:** identity block (when `interviewer != null`)
  followed by the transcript. Selecting an interviewer row or a conversation row
  opens the same detail — no cross-link needed within Conversations.
- **Questions** page: the reply queue. Interaction unchanged (reply textarea →
  `POST …/questions/[id]/reply`, emails the visitor when a contact is present).
  Its detail keeps the one remaining cross-link, "Open conversation →", which now
  navigates to `/[username]/admin?c=<id>` (deep-linkable).
- **Analytics / Content source / Custom domains** pages: render the existing
  panels, which already client-fetch their own data from the unchanged APIs.

## Architecture & data

App Router nested segments under `app/[username]/admin/`:

| Route | Server work | Renders |
|---|---|---|
| `layout.tsx` | `resolveAccountAdmin(username)` (the gate, **moved up** to run once) + a lightweight **counts** load for rail badges | header + `<AdminRail>` + `{children}` |
| `page.tsx` (Conversations) | load conversations (existing limit-200 query) | `<ConversationsSection>` |
| `questions/page.tsx` | load questions | `<QuestionsSection>` |
| `analytics/page.tsx` | — (client-fetches `/analytics`) | `<AnalyticsSection>` |
| `settings/content/page.tsx` | — (client-fetches `/persona-source`) | `<ContentTab>` (existing) |
| `settings/domains/page.tsx` | — (client-fetches `/domains`) | `<DomainsPanel>` (existing) |
| `settings/page.tsx` | — | `redirect` → `settings/content` |

- The auth gate (`resolveAccountAdmin` → `not-found` / `login` / `ok`) moves
  from `page.tsx` into `layout.tsx` so it runs once for the whole section and the
  rail/header render only for authorized owners (and super-admins).
- `lib/admin/data.ts` splits into focused loaders — `loadConversations`,
  `loadQuestions`, and `loadAdminCounts` (cheap counts for rail badges).
  `buildAdminData`'s existing, tested shaping logic is preserved/reused where it
  still applies (e.g. counts/stats).
- The Next.js layout persists across child-route navigations, so the rail does
  not re-mount or flash when switching sections.

### Lower-risk fallback (recorded, not chosen)

If nested routes prove too invasive, a single `page.tsx` retaining one client
shell with section + record in URL search params (`?section=…&c=…`) is an
acceptable fallback. It keeps deep-linking but loads all data upfront and keeps a
larger client component. **Chosen approach is real nested routes** for cleaner
module boundaries and growth headroom.

## Modularization

`admin-dashboard.tsx` (664 lines, all renderers inline) is dissolved into:

- `components/admin/admin-rail.tsx` — grouped left nav: group headers, items,
  count badges, active-state from the current route.
- `components/admin/sections/conversations-section.tsx` — list + `All ·
  Interviewers` segment filter + detail wiring.
- `components/admin/sections/questions-section.tsx` — reply-queue list + detail
  wiring.
- `components/admin/sections/analytics-section.tsx` — the current
  `AnalyticsPanel` (moved out of the monolith).
- `components/admin/details/conversation-detail.tsx` — unified identity +
  transcript detail.
- `components/admin/details/question-detail.tsx` — question + reply form.
- `components/admin/rows/conversation-row.tsx`,
  `components/admin/rows/question-row.tsx` — compact list-cell renderers
  (interviewer row folds into the conversation row's identity badge treatment).
- `components/admin/ui.tsx` + `lib/admin/format.ts` — shared `Badge`, `Field`,
  `fmt`, `LABEL` (currently duplicated between `admin-dashboard.tsx` and
  `domains-panel.tsx`).
- **Reused unchanged:** `RecordList`, `DetailSidebar`, `ContentTab`,
  `DomainsPanel`, `LogoutButton`.

Each module has one clear purpose, a small interface, and is testable in
isolation.

## Testing strategy

Mirrors existing conventions (`vitest` + `@testing-library/react`, `fetch`
stubbed via `vi.stubGlobal` — see `tests/components/admin/domains-panel.test.tsx`).

- **Rail:** renders the two groups + items; marks the active item from the
  current path; shows counts incl. unanswered-questions badge.
- **Conversations section:** `All · Interviewers` filter narrows the list to
  `interviewer != null`; selecting a row opens the unified detail (identity +
  transcript); `?c=<id>` opens a detail on load (deep link).
- **Questions section:** unanswered/answered states; reply submit posts and
  reflects saved state; "Open conversation →" navigates to `?c=<id>`.
- **Layout/gate:** `resolveAccountAdmin` outcomes (`not-found` → 404, `login` →
  redirect, `ok` → renders) — extend `tests/app/username-admin.test.ts`.
- **Data loaders:** `loadConversations` / `loadQuestions` / `loadAdminCounts`
  return the expected shapes (extend `tests/lib/admin/data.test.ts`).

## Implementation plan shape (TDD; detailed plan via writing-plans)

Refactor in safe, behavior-preserving steps, each test-first and kept green:

1. **Extract shared primitives** (`Badge`/`Field`/`fmt`/`LABEL`) + row/detail
   renderers into focused modules — pure refactor, behavior identical.
2. **Extract section components** (Conversations/Questions/Analytics) from the
   monolith, still driven by the old tab state — behavior identical.
3. **Re-nav:** introduce nested routes + shared `layout.tsx` + `AdminRail`; move
   the gate up; put section in the route and selected record in `?c=`/`?q=`;
   delete the old tab bar and per-tab `selected` map.
4. **Merge Interviewers → Conversations:** `All · Interviewers` segment filter +
   unified conversation detail; split `lib/admin/data.ts` into focused loaders +
   rail counts.
5. **Cleanup:** remove dead code, consolidate duplicated styles, verify
   deep-link + cross-link flows end to end.

Executed subagent-driven in an isolated worktree — same workflow as the
custom-domains feature.

## Out of scope (this IA pass)

- Visual/design refresh beyond what re-nav necessarily touches.
- New capabilities — only IA *slots* for future settings (Profile, Branding,
  Notifications, Billing) are created, not the features themselves.
- Responsive / mobile — a separate follow-up (the rail is the element that would
  collapse).
