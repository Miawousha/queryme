# Stripe Billing — Free + Pro Subscription

> Design approved 2026-06-11. Implements ROADMAP Phase 5 (Billing).

## Context & goal

queritae meters every paid model call per account (`account_usage`) and refuses
calls over env-configured caps (`lib/usage/quota.ts`), but has no pricing. The
goal is to monetize with the least new machinery: a free tier generous enough
to demo the product to a real recruiter, and a paid tier that funds the
platform during the bursty, job-search-shaped months when owners actually need
it.

**Decision: freemium subscription (Free + Pro), not a prepaid token currency.**
A token balance fails at the worst moment — the spender (a recruiter
mid-conversation) is not the payer (the owner) — and adds ledger/balance
product surface. A subscription matches job-search usage (subscribe while
hunting, cancel after), never embarrasses a paying owner in front of a
recruiter, and reuses the existing quota machinery exactly as `quota.ts`
anticipated ("Phase 5 (billing) turns these into per-plan numbers behind the
same check").

## Plans

| | Free (default) | Pro — $9/month |
|---|---|---|
| Answered questions | **10 / UTC calendar month**, chat + MCP combined | Fair-use ceilings: current env caps (200 messages/day, 10M tokens/month) |
| Custom domains | Cannot **add**; existing active domains keep serving | Yes (existing 3-domain cap) |
| MCP endpoint | Yes — consumes the same 10-answer allowance | Yes |
| At the limit | Forward-only mode (below) | n/a in normal use |

- The Free allowance is a query over `account_usage` for the current month —
  nothing to reset, no rollover.
- MCP stays on Free deliberately: the allowance bounds its cost, and it is the
  product's differentiator.
- Kill switches win: `disabled`/`waitlisted` accounts stay dead regardless of
  subscription state.

## Data model (one Drizzle migration)

- `accounts.plan` — `text enum("free" | "pro")`, not null, default `"free"`.
  On `accounts` because the chat handler already loads the account row per
  request; plan enforcement costs zero extra queries.
- New `account_billing` table — Stripe state cache plus billing-adjacent
  account state. Stripe fields are written only by billing code (webhook +
  checkout sync); `lastNudgeMonth` is upserted from the allowance check when
  the nudge email sends (a row may therefore exist for a never-subscribed
  free account). Read by the settings page:
  - `accountId` uuid FK → accounts, unique
  - `stripeCustomerId` text, unique
  - `stripeSubscriptionId` text
  - `subscriptionStatus` text (raw Stripe status)
  - `currentPeriodEnd` timestamptz
  - `lastNudgeMonth` text ("YYYY-MM") — guards the one-per-month upgrade email
  - `updatedAt` timestamptz
- `getUsageTotals` (lib/usage/repo.ts) gains `monthMessages` — same aggregate,
  one more column.

Stripe is the source of truth; the DB is a cache derived from it.

## Stripe objects & environment

- One Product "Queritae Pro" with one recurring Price, $9/month USD, created
  via API in test mode during implementation (localized pricing out of scope).
- Env vars: `STRIPE_SECRET_KEY` (present in `.env.local`, test mode),
  `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRO_PRICE_ID`. Mirrored into Vercel at
  go-live with live-mode values.

## Flows

**Upgrade.** `POST /api/billing/checkout` (owner-authed, same admin auth as
existing settings routes): create-or-reuse the Stripe customer (persist
mapping), create a Checkout Session (`mode: subscription`,
`client_reference_id: accountId`, email prefilled), redirect to Stripe-hosted
checkout. Success/cancel URLs return to the settings page.

**Webhook.** `POST /api/stripe/webhook` — verify signature
(`STRIPE_WEBHOOK_SECRET`); on failure respond 400 (Stripe retries). Handle
three event families as idempotent, status-derived upserts into
`account_billing` + `accounts.plan`:

- `checkout.session.completed` → record customer/subscription IDs, set plan
- `customer.subscription.updated` → re-derive plan from status
- `customer.subscription.deleted` → downgrade to free

Plan derivation is one pure function from subscription status:
`active | trialing | past_due → pro` (past_due keeps Pro through Stripe's
~2-week smart-retry window); `canceled | unpaid | incomplete_expired → free`.
Unknown events are acknowledged (200) and ignored. Because every handler
derives the same state from the event's subscription status, duplicate or
out-of-order deliveries converge.

**Checkout/webhook race.** The success URL carries the Checkout session ID;
the settings page retrieves the session server-side and applies the same
upsert immediately, so the owner never sees "paid but still Free" while the
webhook lags.

**Manage billing.** `POST /api/billing/portal` → Stripe Customer Portal
session (cancel, card update, invoices — all Stripe-hosted). Cancellation
takes effect at period end (Stripe keeps status `active` until then; the
`deleted` event downgrades). No proration logic.

**Re-subscribe.** Customer ID is reused from `account_billing`, keeping Stripe
history on one customer.

## Enforcement & forward-only mode

- `quotaConfig(plan)` returns per-plan numbers. Free: `monthlyMessages: 10`
  (binding), plus the platform ceilings. Pro: current env caps unchanged.
- `checkQuota` gains verdict reason `"plan_allowance"` when
  `monthMessages >= monthlyMessages`.
- **Chat route**: on `plan_allowance`, return a structured response the client
  renders as an assistant-styled bubble — "I've answered my free questions
  this month — leave your question and a way to reach you, and {owner} will
  reply personally" — wrapping the existing forward-question form. No paid
  model call is made.
- **MCP `ask` tool**: returns the equivalent text pointing the calling agent
  at `forward_question`, which stays available (it makes no model call).
- **Upgrade nudge**: the first time each month an account crosses the
  allowance, email the owner via the existing transport
  (`lib/notify/email.ts`), guarded by `account_billing.lastNudgeMonth`.

## UI

- **Billing section** on the account settings page, following existing section
  styles: plan badge; usage meter (Free: "7 of 10 answers used this month";
  Pro: messages/tokens vs fair-use caps); Free shows **Upgrade to Pro** →
  Checkout; Pro shows renewal date + **Manage billing** → Portal.
- **Domains settings**: "add domain" gated behind Pro with an upgrade link;
  existing domains untouched.
- **Chat**: forward-only bubble (above).

## Testing

- **Unit (vitest, alongside existing lib tests):** plan derivation from
  subscription status; `quotaConfig(plan)` numbers; `checkQuota` →
  `plan_allowance` at 10 monthly messages; webhook handler fed constructed
  events with `stripe.webhooks.generateTestHeaderString` so signature
  verification is exercised for real.
- **Handler tests:** chat route returns the forward-only payload at the
  limit; MCP `ask` returns the forward-pointing message.
- **End-to-end (manual, test mode):** `stripe listen` forwarding to
  localhost; subscribe with card 4242…; cancel from the dashboard; verify
  downgrade.

## Out of scope (v1)

- Annual plans, localized/EU pricing, Stripe Tax/VAT handling
- Refunds and dispute handling
- Multiple paid tiers; per-seat or usage-based pricing
- Grandfathering flows beyond "existing domains keep serving"
