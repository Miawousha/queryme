# Tabbed Full-Width Admin Dashboard — Design

**Date:** 2026-05-22
**Status:** Approved, ready for implementation planning

## Background

The `/admin` dashboard (`components/admin/admin-dashboard.tsx`) currently renders
a centered (`max-w-4xl`) server component: four stat tiles stacked above three
stacked `Section`s — Interviewers, Conversations, Forwarded questions.

This redesign moves the three sections into **tabs** and brings the dashboard in
line with the visual language of the main app (`/`): a full-height, full-width
app shell with `GridBackground`, a slim chrome header, and `h-11` header bands.

## Goals

- Interviewers / Conversations / Questions become three tabs.
- Full-width, full-height layout matching the chat + KB aesthetic.
- No loss of information — the four metrics currently shown as stat tiles remain
  visible.

## Non-goals

- No data-layer change — `loadAdminData` / `buildAdminData` already return
  everything needed.
- No i18n — the admin stays English-only, as today.
- No tab-state persistence across reloads (pure component state).

## Layout

Drop the centered `max-w-4xl`. The dashboard becomes a full-height app shell,
structurally identical to `app/page.tsx`:

```
<GridBackground />
<div class="relative z-10 flex h-dvh flex-col">
  <header>  slim full-width chrome — MatriceLogo + "Admin" name, ThemeToggle, LogoutButton
  <nav>     h-11 tab band — 3 tab buttons (left) + active tab's secondary metric (right)
  <div class="flex-1 overflow-auto">  active tab content, full-width, padded
</div>
```

- **Header** matches `AppTopBar`: `border-b border-[var(--color-border)]`,
  `bg-[var(--color-surface)]/60`, `backdrop-blur`. Reuses `MatriceLogo`,
  `ThemeToggle`, `LogoutButton`.
- **Tab band** matches the `h-11` `BAND` style used by the chat and KB panes
  (`flex h-11 shrink-0 items-center gap-2 border-b ... px-4`).
- **Content** is the single scroll region (`flex-1 overflow-auto`), padded,
  full-width.

## Tabs

Three tabs, fixed order: **Interviewers**, **Conversations**, **Questions**.

- Each tab label carries its count, styled like the existing mono-uppercase
  band labels (`font-mono text-[10px]/[11px] uppercase`, tracked). Count is the
  length of the corresponding list in `AdminData`.
- **Active** tab: accent color + a `border-b` indicator. **Inactive**: tertiary
  text, hover → primary.
- The right side of the tab band shows the **active tab's secondary metric**:
  - Conversations → `N chat · N mcp` (from `stats.chat` / `stats.mcp`)
  - Questions → `N unanswered` (from `stats.unanswered`); omitted/"all answered"
    when zero
  - Interviewers → `N stated · N inferred` (derived in the component from the
    `interviewers` list's `interviewer.basis`)

Active tab is component state, defaulting to **Interviewers**. Not persisted
across reloads.

## Components

- **`AdminDashboard`** becomes a client component (`"use client"`). It needs
  `useState` for the active tab. It only renders already-serialized `data`
  (no server-only APIs), so the conversion is safe. `app/admin/page.tsx` stays
  a server component (auth check + `loadAdminData`).
- **Reused as-is:** `InterviewerCard`, `ConversationRow`, `QuestionRow`, and the
  `Badge` / `Field` / `Empty` / `fmt` helpers, plus the `LABEL` / `CARD` style
  constants.
- **Removed:** `Stat` and `Section` — tabs replace them.
- **Reused from the app:** `GridBackground`, `MatriceLogo`, `ThemeToggle`,
  `LogoutButton`.

If `admin-dashboard.tsx` grows unwieldy past the change, the three tab panels /
row components may be extracted into a sibling file — but the default is to
keep them in the one file, as they are today.

## Interviewer → conversation cross-link

`InterviewerCard` is currently an `<a href="#conv-{id}">`. With tabs, that
anchor cannot resolve while a different tab is active.

New behavior: clicking an interviewer card **switches to the Conversations tab
and scrolls to that conversation's row**, opening its `<details>`. Mechanism:
the card calls a callback `(conversationId) => …` passed from `AdminDashboard`,
which sets the active tab to Conversations and, after the tab renders, scrolls
the matching `#conv-{id}` element into view and sets its `<details open>`.

`ConversationRow` keeps its `id={`conv-${conversation.id}`}` anchor for the
scroll target.

## Error handling

Presentational component — no new error paths. Empty states for each tab reuse
the existing `Empty` component ("No interviewers identified yet.", etc.).

## Testing

- `buildAdminData` is already unit-tested; no data-layer change here.
- The dashboard is presentational and has no existing unit tests — none added,
  consistent with the codebase.
- Verify with `pnpm typecheck` and `pnpm build`, plus a visual check in the
  running dev preview (tab switching, full-width layout, the cross-link jump).

## Out of scope / future work

- Tab state in the URL (shareable / reload-stable).
- Pagination of the conversations list beyond `CONVERSATION_LIMIT`.
