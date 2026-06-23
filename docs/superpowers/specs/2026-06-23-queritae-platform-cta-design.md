# Queritae platform CTA for profile/CV visitors

**Date:** 2026-06-23
**Status:** Design — awaiting review

## Summary

Give visitors of a user's public profile (interviewers, recruiters) a low-friction,
non-intrusive way to learn that the page they're reading runs on **Queritae** — and to
become users themselves. The mechanism is a small **"queritae" wordmark pill** in the
top bar of both the chat page and the standalone CV page. The pill doubles as ambient
platform attribution and as the click target; clicking it opens a short **explainer
modal** with a personalized pitch and two CTAs (explore the landing page / sign up with
GitHub).

The pill is always on for every profile, free and Pro. It deliberately reads as neutral
platform presence — not a loud "powered by" badge — so it never competes with the owner's
own pitch to the interviewer.

## Decisions (settled)

| Question | Decision |
| --- | --- |
| Form / prominence | A neutral, opt-in **top-bar button**, not a persistent "powered by" badge or a contextual interrupt-card. |
| Button treatment | The **"queritae" wordmark pill** (lowercase + glow-dot motif) *is* the button — ambient attribution + click target in one. |
| Surfaces | **Chat page** (`AppTopBar`) **and** standalone **CV page** (`CvTopBar`). |
| Relationship to existing "About this project" modal | **Separate, dedicated** button + its own modal. The About modal stays about *this person's* setup; the new modal is about *the platform*. |
| Owner control | **Always on for everyone** — no hide-toggle, no Pro gating. |
| Primary CTA target | The existing **landing page** `/?ref=profile` (the real closer: full pitch + live demo + its own signup). Secondary CTA links straight to GitHub OAuth. |
| Personalization | **Yes** — the pitch names the profile owner ("This is *Alexandre's* queryable CV…"). |
| Printed CV | **No** printed-CV footer in this scope. The pill lives in the `no-print` bar and never prints. (Noted as a possible later growth lever.) |
| Analytics | **No** funnel/tracking in this scope. Outbound links carry `?ref=profile` so attribution *can* be wired up later. |

## Component — `components/queritae-cta.tsx`

A single **self-contained** client component: the trigger pill **and** its own modal, with
the open/close state encapsulated inside it (via the existing `useDialog` hook). This is a
deliberate, small deviation from `AboutPopover` (which is parent-controlled): because the
widget drops into **two different surfaces** (chat via `home-shell`, CV via `cv-standalone`),
encapsulating its own modal lets each bar adopt it with one line instead of threading
`open`/`onOpen`/modal-render through two parents. The host bars stay effectively stateless.

```
QueritaeCtaStrings = {
  pill: string;            // "queritae" — the wordmark label (a11y/title)
  title: string;          // "What is Queritae?"
  // personalized template — `{name}` is substituted client-side, falls back to
  // the generic clause when personaName is absent:
  pitchWithName: string;  // "This is {name}'s queryable CV — a résumé you can interview.
                          //  Queritae turns a GitHub repo of career notes into a grounded
                          //  AI agent that answers questions, with citations."
  pitchGeneric: string;   // "A résumé you can interview. Queritae turns a GitHub repo…"
  bullets: string[];      // 3 short value props (grounded answers · agent-native (MCP) · your own domain)
  exploreCta: string;     // "Explore Queritae →"   (primary → landing)
  signupCta: string;      // "Create yours with GitHub"  (secondary → OAuth)
  close: string;          // "Close"
}

QueritaeCtaProps = {
  strings: QueritaeCtaStrings;
  personaName?: string | null;   // owner display name; null → generic pitch
  landingHref: string;           // "/?ref=profile"
  signupHref: string;            // "/api/auth/github/login"
  /** Optional class to tune pill sizing to the host bar (chat vs CV). */
  className?: string;
}
```

- **Pill markup**: a `<button type="button">` styled like the existing mono pills in the
  bars — a small glow dot + `queritae` in lowercase mono. Reuses the bars' existing color
  tokens (`--color-border`, `--color-card`, `--color-accent`, `--color-text-*`). `title` +
  `aria-haspopup="dialog"` mirror the other top-bar buttons.
- **Modal markup**: copy `AboutPopover`'s overlay + panel structure verbatim
  (`fixed inset-0 … bg-black/50`, `max-w-md` panel, `useDialog(open, onClose)`, close button,
  title). Body = pitch paragraph → bullet list (same glow-dot bullet style as About) → CTA row.
- **CTA row**:
  - Primary `exploreCta` → `<a href={landingHref}>` (internal nav, same-tab).
  - Secondary `signupCta` → `<a href={signupHref}>` styled as a quieter link/outline.
  - Both are plain `<a>` (not `next/link`) so the component stays surface-agnostic and
    needs no router. `landingHref` already carries `?ref=profile`.
- **Personalization**: if `personaName` is set, render `pitchWithName` with `{name}`
  substituted; else `pitchGeneric`. No owner first/last-name parsing — use the display name
  as given.

## i18n & data flow

Strings follow the existing per-locale, server-assembled pattern exactly — no new client
i18n machinery.

- **Chat page** — add a `queritae` namespace to `UiStrings` in `lib/language.ts` (en + fr),
  alongside `about`/`mcp`/`footer`. `home-shell.tsx` already holds `t: UiStrings` and the
  persona; it passes `strings={t.queritae}`, `personaName={…}`, and the two hrefs down so the
  pill can render inside `AppTopBar`.
- **CV page** — add the same string shape to `CV_STRINGS` in `lib/cv/strings.ts` (en + fr).
  `cv-standalone.tsx` already resolves `const t = CV_STRINGS[lang]` and has the profile/persona;
  it passes the strings + name + hrefs into `CvTopBar`.

### Wiring the pill into the two bars

- `AppTopBar` (`components/app-top-bar.tsx`): add optional props
  (`queritaeStrings`, `personaName`, `landingHref`, `signupHref`) and render
  `<QueritaeCta …/>` at the right end of the controls cluster (after the language toggle /
  KB toggle). The bar itself remains stateless — the child owns its modal. Visible on mobile
  (compact: dot + wordmark).
- `CvTopBar` (`components/cv/cv-top-bar.tsx`): add the same props and render `<QueritaeCta …/>`
  next to the Print button. The bar's container already carries `no-print`, so the pill and
  modal never appear on a printed/PDF'd CV.

### Hrefs

- `landingHref = "/?ref=profile"` — the landing page renders normally; the param is inert
  today and reserved for future attribution.
- `signupHref = "/api/auth/github/login"` — the existing OAuth entry point, unchanged. (No
  `ref` is threaded through OAuth state in this scope.)

## Copy (initial, both locales)

**EN**
- pill: `queritae`
- title: `What is Queritae?`
- pitchWithName: `This is {name}'s queryable CV — a résumé you can interview. Queritae turns a GitHub repo of career notes into a grounded AI agent that answers questions about a person, with citations.`
- pitchGeneric: `A résumé you can interview. Queritae turns a GitHub repo of career notes into a grounded AI agent that answers questions about a person, with citations.`
- bullets: `Grounded in real career notes`, `Agent-native — built-in MCP endpoint`, `Your own domain`
- exploreCta: `Explore Queritae →`
- signupCta: `Create yours with GitHub`

**FR**
- pill: `queritae`
- title: `Qu'est-ce que Queritae ?`
- pitchWithName: `Voici le CV interrogeable de {name} — un CV que l'on peut interviewer. Queritae transforme un dépôt GitHub de notes de carrière en un agent IA fiable qui répond aux questions, avec citations.`
- pitchGeneric: `Un CV que l'on peut interviewer. Queritae transforme un dépôt GitHub de notes de carrière en un agent IA fiable qui répond aux questions, avec citations.`
- bullets: `Fondé sur de vraies notes de carrière`, `Pensé pour les agents — endpoint MCP intégré`, `Votre propre domaine`
- exploreCta: `Découvrir Queritae →`
- signupCta: `Créez le vôtre avec GitHub`

## File changes

| File | Change |
| --- | --- |
| `components/queritae-cta.tsx` | **New** — `QueritaeCta` (pill + modal), `QueritaeCtaStrings` type. |
| `lib/language.ts` | Add `queritae` namespace to `UiStrings` (en + fr). |
| `lib/cv/strings.ts` | Add matching strings to `CV_STRINGS` (en + fr). |
| `components/app-top-bar.tsx` | Add props; render `<QueritaeCta>` in the controls cluster. |
| `components/home-shell.tsx` | Pass `t.queritae`, `personaName`, hrefs into `AppTopBar`. |
| `components/cv/cv-top-bar.tsx` | Add props; render `<QueritaeCta>` next to Print. |
| `components/cv/cv-standalone.tsx` | Pass strings, `personaName`, hrefs into `CvTopBar`. |

## Testing

- **Component test** (`components/queritae-cta` render test, matching existing component-test
  style):
  - Renders the pill (wordmark + a11y label).
  - Opens the modal on click; `Escape`/overlay-click closes it (via `useDialog`).
  - Personalized pitch when `personaName` set; generic pitch when null.
  - Primary CTA `href === "/?ref=profile"`; secondary CTA `href === "/api/auth/github/login"`.
  - Renders FR strings when given the FR string set.
- **No** server/route tests — no new routes or data access are introduced.

## Non-goals (explicit)

- No analytics / conversion funnel (only the inert `?ref=profile` param).
- No owner hide-toggle and no Pro/plan gating.
- No printed-CV footer or any change to the print stylesheet.
- No change to the OAuth flow, the landing page, or the existing "About this project" modal.
- No new dependency.

## Open follow-ups (out of scope, noted)

- Printed-CV attribution footer (forwarded PDFs currently lose all branding) — a stronger
  growth vector, but more intrusive; revisit separately.
- Wire `?ref=profile` (and which profile) into real conversion analytics once any
  client-side analytics exists.
