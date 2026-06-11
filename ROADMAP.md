# Queritae — Deployment Roadmap

> Based on a code-level audit (2026-06-10), not on prior planning docs.
> Context: the product loop — publish → converse → cite → capture → forward → reply —
> is complete and coherent. What's absent is everything that turns a working product
> into a deployable business: cost controls, onboarding, and guardrails.
>
> **Ordering principle:** everything that limits liability comes before everything
> that drives adoption. The gate to deploy publicly is the end of Phase 3.

## Phase 0 — Decks cleared (~½ day)

Remove what contradicts the SaaS-only direction so later phases don't build around dead weight.

- [x] Delete the self-host path: `Dockerfile`, `docker-compose.yml`, `.dockerignore`, and any docs referencing it.
- [x] Retire the legacy root singleton routes (`app/api/chat`, `app/api/cv`, `app/api/forward-question`) — delete or make them thin redirects to the `/api/a/{root}/` namespace, so there's exactly one code path per feature.
- [x] Sweep README/docs for remaining queryme references (infra slugs intentionally stay).

## Phase 1 — Close the cost faucet (deployment blocker)

Any GitHub user can auto-provision a tenant (`lib/accounts/repo.ts:79`) and chat on the
platform's Anthropic key, capped only per-IP. Nothing else matters until this is closed.

- [x] **Signup gate** — invite/allowlist check in the OAuth callback; uninvited logins land on a waitlist screen instead of minting an account. DB-driven flag, approvable from the super-admin console.
- [x] **Per-account usage metering** — a `usage` table (accountId, day, message count, input/output tokens) written from the `onFinish` callback in `lib/chat/handle-chat.ts` and the MCP `ask` tool. The AI SDK already returns token usage; it just isn't recorded.
- [x] **Quota enforcement** — daily/monthly caps checked at the top of the chat and MCP handlers, with a graceful "this persona is resting" response. Per-account rate limits alongside the existing per-IP ones.
- [x] **Kill switches** — an `accounts.disabled` flag honored by middleware, plus a super-admin toggle.
- [x] **Spend alerting** — daily cron that emails when platform-wide or per-account usage crosses a threshold.

This phase is also the foundation for billing (Phase 5) — metering first, pricing after.

## Phase 2 — Own the citation contract (product integrity)

The product's differentiator (cited, verifiable answers) currently depends on every owner's
external `prompts/system.md` remembering to instruct the `[^kb:...]` format. The app never
validates or injects it — one owner's prompt without it silently loses citations and
flatlines their analytics. Make the shell own the contract:

- [ ] **Inject a canonical citation instruction** as an app-controlled system-prompt part in `lib/answerer.ts`, regardless of what the persona repo says. The owner's prompt customizes voice; the platform guarantees grounding.
- [ ] **Validate at sync** — extend the required-files check (`lib/persona-source.ts:44`) and `validate-kb` to lint the content repo: citation markers parse, refs resolve to real KB paths. Surface warnings in the admin Content tab.
- [ ] **Contract tests** — lock the pipeline end-to-end: assembler `[ref:]` → model format → `parseCitations` → renderer.

## Phase 3 — Trust, safety, and ops floor (before strangers arrive)

- [ ] **Terms acceptance** at first login (`tosAcceptedAt` column + one-time interstitial).
- [ ] **Account suspension** action in the super-admin console (builds on Phase 1's disabled flag), plus a content-report path — even just a mailto on persona pages.
- [ ] **Impersonation guardrails** — reserved-slug list exists (`lib/accounts/slug.ts`); add brand/person-name review for custom domains and usernames.
- [ ] **Ops checklist** — error monitoring (none found in code), DB backup verification on Neon, smoke test for the persona sync path (it touches `/tmp` on serverless).

---

**🚀 Public deployment gate: end of Phase 3.**
Phases 4–6 are growth and ship incrementally after launch — except the template repo
(4.1), which should be pulled into launch week: it costs almost nothing and is the
difference between a demo and a product someone else can adopt.

---

## Phase 4 — The onboarding ramp (adoption)

The steepest non-financial barrier: first value requires hand-authoring a structured
content repo with required files. No template flow, no in-app editor, no import.

- [ ] **Template content repo** with "Use this template" — one click on GitHub, paste the URL into the Content tab, done. Cheapest version of onboarding; do this first.
- [ ] **Guided NotConfiguredScreen** — turn the current dead-end into a checklist (create repo from template → link it → first sync → first question), with live sync status.
- [ ] **CV importer** (bigger; can trail launch) — PDF/LinkedIn export → scaffolded `kb/` tree, building on `scripts/enrich-repo.ts`. This opens the audience beyond developers.

## Phase 5 — Billing

Shipped 2026-06-11 — spec: `docs/superpowers/specs/2026-06-11-stripe-billing-design.md`,
plan: `docs/superpowers/plans/2026-06-11-stripe-billing.md`.

- [x] Stripe subscriptions, two plans: free (10 answered questions/month, forward-only past the limit) and pro ($9/month — fair-use caps, custom domains; MCP on both, metered by the same allowance).
- [x] Plan enforcement wired into the existing quota checks — `quotaConfigForPlan` behind the same `checkQuota`, new `plan_allowance` verdict.
- [x] Billing section in account settings (upgrade via Stripe Checkout, manage via Customer Portal).

## Phase 6 — Retention polish (post-launch)

- [ ] **Repeat-visitor memory** — version interviewer identity instead of overwriting in place (`lib/interviewer/repo.ts`); surface "this person came back" in the admin.
- [ ] Email verification for forwarded-question contacts.
- [ ] Audit log for admin actions.
- [ ] Conversation export.
