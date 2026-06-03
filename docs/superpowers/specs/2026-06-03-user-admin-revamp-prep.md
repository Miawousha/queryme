# User Admin Revamp — Prep Brief

**Date:** 2026-06-03
**Status:** Prep brief (pre-design) — input for next session's brainstorm
**Scope:** The **per-account ("user") admin** at `/[username]/admin` — NOT the super-admin at `/admin`.
**Primary goal (chosen):** **Restructure / information architecture** — reorganize tabs, clarify flows, reduce clutter. Visual refresh, new features, and mobile/responsive were *not* selected as priorities for this pass (see Out of Scope).

---

## 1. Current state (condensed)

`/[username]/admin` (`app/[username]/admin/page.tsx`) gates on `resolveAccountAdmin(username)` → `not-found` (404) / `login` (redirect to GitHub) / `ok` → renders `<AdminDashboard apiBasePath="/api/a/{username}/admin" data={…} />`.

**The shell** — `components/admin/admin-dashboard.tsx` is a single **664-line / ~25 kB** `"use client"` component holding the tab bar, tab-state, the detail sidebar, *and* all row/detail renderers inline.

**Six flat tabs**, which actually serve three different jobs:

| Tab | Job | Renders | Data |
|---|---|---|---|
| Interviewers | activity | conversations where `interviewer != null` | server-loaded |
| Conversations | activity | all conversations (cap 200) | server-loaded |
| Questions | activity (action queue) | forwarded questions + reply form | server-loaded; POST reply |
| Analytics | insight | per-day chart, top topics, citation density | GET `/analytics` |
| Content | setting | persona-source repo sync + history | GET/POST `/persona-source` |
| Domains | setting | custom-domain add/verify/remove | GET/POST/DELETE/refresh `/domains` |

**Detail sidebar** — a shared right slide-over (`detail-sidebar.tsx`) used by the three activity tabs; per-tab `selected` record map preserves what's open per tab; cross-tab "Open conversation →" jumps to Conversations.

**Design system** — CSS vars (`--color-*`), `font-mono` uppercase labels with letter-spacing, `cn()` from `@/lib/utils`, border-only buttons, pill badges. Loading = "Loading…" text (no spinners); errors = inline red text (no toasts).

**Files** (this section): `app/[username]/admin/{page.tsx,resolve.ts}`; `components/admin/{admin-dashboard,detail-sidebar,record-list,content-tab,domains-panel,logout-button}.tsx`; `app/api/a/[username]/admin/{analytics,persona-source,domains,domains/[id],domains/[id]/refresh,questions/[id]/reply}/route.ts`; `lib/admin/data.ts`.

### IA-relevant rough edges
- **Flat 6-tab bar mixes three concerns** (activity / insight / settings) with no grouping — the core IA problem.
- **Three of the six tabs are views of the same conversation data.** Interviewers = conversations with an identified interviewer; Questions tie back to conversations. Redundant top-level real estate.
- **No room to grow** — adding settings (profile, branding, notifications) means the flat tab bar overflows.
- **Tab state isn't in the URL** — not deep-linkable; lost on reload.
- **664-line monolith** — detail panels, row renderers, analytics, and shell all in one file; hard to evolve.

(Full current-state map captured during this session — see the exploration notes if a deeper reference is needed.)

---

## 2. Goal for the revamp

Reorganize the per-account admin so the structure matches how it's actually used:
- **Group by concern** — separate day-to-day *activity* from *configuration/settings*.
- **Remove redundancy** — collapse the overlapping conversation views.
- **Leave room to grow** — a nav that scales as settings are added.
- **(Companion) modularize** the 664-line `admin-dashboard.tsx` as part of the restructure — IA changes are the natural moment to split it.

---

## 3. Proposed directions (3)

### Direction A — Grouped left rail + merged Inbox  ⭐ recommended
Replace the flat top tab bar with a **left navigation rail in two groups**:
- **Activity:** **Inbox** (merges Conversations + Interviewers + Questions into one list with filter chips — *All / Interviewers / Questions / Unanswered*), **Analytics**.
- **Settings:** **Content source**, **Custom domains** (room to grow: Profile / branding / notifications).

The detail sidebar stays (it already adapts per record type). Interviewers/Questions become filters over the unified Inbox rather than separate tabs.
- **+** Directly fixes both IA problems (mixed concerns *and* redundant conversation views); scales cleanly as settings grow.
- **−** Largest change; merging three views needs care (filters, the action-queue nature of Questions); left rail consumes horizontal space (desktop-first, fine for now).

### Direction B — Keep activity tabs, split Settings behind a gear
Top tab bar keeps **Conversations, Interviewers, Questions, Analytics**; **Content + Domains** move behind a single **Settings** entry (gear) with its own sub-navigation.
- **+** Lower risk, less disruptive; cleanly separates activity from configuration; no data-view merge.
- **−** Still four activity tabs with the Interviewers/Conversations/Questions overlap unresolved; two nav paradigms (tabs + settings sub-nav).

### Direction C — Inbox-centric + slide-over settings
One primary **Inbox** (all conversations, filter/sort), **Analytics** as a second view, and **Settings** as a slide-over/modal (gear) holding Content + Domains. Minimal top level (2 items + settings).
- **+** Maximal clutter reduction — "your inbox + insights," config tucked away.
- **−** Settings-in-a-modal feels cramped for Content's sync history and the Domains list; doesn't scale if settings grow.

**Recommendation: Direction A** — best balance of clutter reduction (merging the three conversation views) and scalability (Activity vs Settings grouping with headroom). It's the most direct answer to the IA goal.

---

## 4. Open questions for next session
1. **Merge depth:** fold Interviewers + Conversations + Questions into one Inbox with filters, or keep **Questions** separate as an action queue (it's a to-do list, not just a view)?
2. **Nav pattern:** left rail (Direction A) vs grouped top tabs (B) — desktop-only for this pass?
3. **Settings growth:** do settings get real sub-routes (`/[username]/admin/settings/...`, deep-linkable) or in-page sub-nav? What future settings are coming (profile, branding, notifications, billing)?
4. **Deep-linking:** should the active section/record live in the URL (shareable, reload-safe) instead of React state?
5. **Modularization:** split `admin-dashboard.tsx` (detail panels, row renderers, each section → own files) as part of this? (Recommended: yes.)
6. **Mobile:** in scope for this pass or a separate follow-up? (Not prioritized now → likely follow-up.)

---

## 5. Out of scope (this IA pass, per priorities chosen)
- **Visual/design refresh** beyond what the restructure necessarily touches.
- **New capabilities** (richer analytics, profile/branding controls, etc.) — except where the IA naturally creates the slot.
- **Responsive / mobile** — a separate follow-up.

---

## 6. Suggested next-session flow
1. Resolve open questions 1–3 (merge depth, nav pattern, settings model) — these decide the architecture.
2. Lock Direction A (or chosen variant) into a design doc.
3. Plan as TDD tasks (likely: extract/modularize first, then re-nav, then merge the Inbox), execute subagent-driven like the custom-domains feature.
