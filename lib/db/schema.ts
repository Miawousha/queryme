import { pgTable, uuid, text, timestamp, jsonb, index, uniqueIndex, date, integer, boolean } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Account lifecycle. New GitHub-OAuth signups start `waitlisted` (no public
 * surfaces, no paid model calls) until a super-admin approves them; `disabled`
 * is the kill switch — same effect as waitlisted, but signals an explicit
 * revocation rather than a pending approval. The DB default is `waitlisted` so
 * any insert path that forgets to set a status fails closed, not open.
 */
export const ACCOUNT_STATUSES = ["active", "waitlisted", "disabled"] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

/**
 * Billing plans. `free` is the default for every account; `pro` is set only by
 * billing code deriving it from the Stripe subscription status — never by hand.
 */
export const ACCOUNT_PLANS = ["free", "pro"] as const;
export type AccountPlan = (typeof ACCOUNT_PLANS)[number];

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    githubId: text("github_id"), // unique-when-present (see index below)
    username: text("username").notNull().unique(),
    role: text("role", { enum: ["user", "admin"] }).notNull().default("user"),
    status: text("status", { enum: ACCOUNT_STATUSES }).notNull().default("waitlisted"),
    plan: text("plan", { enum: ACCOUNT_PLANS }).notNull().default("free"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    tosAcceptedAt: timestamp("tos_accepted_at", { withTimezone: true }),
  },
  (table) => ({
    githubIdUnique: uniqueIndex("accounts_github_id_unique")
      .on(table.githubId)
      .where(sql`github_id IS NOT NULL`),
  }),
);

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    channel: text("channel", { enum: ["chat", "mcp"] }).notNull(),
    language: text("language", { enum: ["en", "fr"] }),
    transcript: jsonb("transcript").$type<ConversationTurn[]>().notNull().default(sql`'[]'::jsonb`),
    interviewer: jsonb("interviewer").$type<InterviewerIdentity>(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
    accountId: uuid("account_id").references(() => accounts.id),
  },
  (table) => ({
    accountLastMsgIdx: index("conversations_account_last_msg_idx").on(
      table.accountId,
      sql`${table.lastMessageAt} DESC`,
    ),
  }),
);

export const forwardedQuestions = pgTable("forwarded_questions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: uuid("conversation_id").references(() => conversations.id),
  question: text("question").notNull(),
  contact: text("contact"), // optional visitor contact (email / phone / handle)
  reply: text("reply"),
  answeredAt: timestamp("answered_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ConversationTurn = {
  role: "user" | "assistant";
  text: string;
  at: string; // ISO timestamp
};

/**
 * What the agent has learned about the visitor it is talking to. Stored as a
 * single jsonb sub-record of its conversation, overwritten in place each time
 * the agent calls the `identify_interviewer` tool. All identity fields are
 * optional — the agent fills whatever it has.
 */
export type InterviewerIdentity = {
  name?: string;
  company?: string;
  role?: string; // the visitor's own title, e.g. "VP Engineering"
  hiringFor?: string; // the role/context they are recruiting for
  contact?: string; // email / LinkedIn, if shared
  notes?: string; // free-text context that doesn't fit a field
  basis: "stated" | "inferred";
  updatedAt: string; // ISO timestamp, set server-side
};

export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
export type ForwardedQuestion = typeof forwardedQuestions.$inferSelect;

export const personaSource = pgTable(
  "persona_source",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    repoUrl: text("repo_url").notNull(),
    branch: text("branch").notNull().default("main"),
    commitSha: text("commit_sha").notNull(),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
    status: text("status", { enum: ["ok", "error"] }).notNull(),
    error: text("error"),
    accountId: uuid("account_id").references(() => accounts.id),
  },
  (table) => ({
    syncedAtIdx: index("persona_source_synced_at_idx").on(sql`${table.syncedAt} DESC`),
    accountSyncedAtIdx: index("persona_source_account_synced_at_idx").on(
      table.accountId,
      sql`${table.syncedAt} DESC`,
    ),
  }),
);

export type PersonaSource = typeof personaSource.$inferSelect;
export type NewPersonaSource = typeof personaSource.$inferInsert;

/** One Vercel-issued verification challenge for a custom domain. */
export type DomainVerification = {
  type: string;
  domain: string;
  value: string;
  reason?: string; // Vercel omits this for some challenge types
};

export const domains = pgTable(
  "domains",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    accountId: uuid("account_id")
      .references(() => accounts.id)
      .notNull(),
    hostname: text("hostname").notNull(), // normalized lowercase; unique below
    status: text("status", { enum: ["pending", "active", "error"] })
      .notNull()
      .default("pending"),
    verification: jsonb("verification").$type<DomainVerification[]>(),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  },
  (table) => ({
    hostnameUnique: uniqueIndex("domains_hostname_unique").on(table.hostname),
    accountIdx: index("domains_account_idx").on(table.accountId),
  }),
);

export type Domain = typeof domains.$inferSelect;
export type NewDomain = typeof domains.$inferInsert;

/**
 * Per-account, per-UTC-day usage counters, split by channel. Every paid model
 * call increments exactly one row (upsert on the unique key), so quota checks
 * are a cheap aggregate over a handful of rows rather than a transcript scan.
 * Token counts are what the model API reports (input includes cache reads).
 */
export const accountUsage = pgTable(
  "account_usage",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    accountId: uuid("account_id")
      .references(() => accounts.id)
      .notNull(),
    day: date("day").notNull(), // UTC calendar day, "YYYY-MM-DD"
    channel: text("channel", { enum: ["chat", "mcp"] }).notNull(),
    messages: integer("messages").notNull().default(0),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    accountDayChannelUnique: uniqueIndex("account_usage_account_day_channel_unique").on(
      table.accountId,
      table.day,
      table.channel,
    ),
    accountDayIdx: index("account_usage_account_day_idx").on(table.accountId, table.day),
  }),
);

export type AccountUsage = typeof accountUsage.$inferSelect;

/**
 * Stripe state cache plus billing-adjacent account state, one row per account.
 * Stripe fields are written only by billing code (webhook + checkout sync);
 * `lastNudgeMonth` is claimed from the allowance check when the upgrade-nudge
 * email sends, so a row may exist for a never-subscribed free account. Stripe
 * is the source of truth — this table is derived from it.
 */
export const accountBilling = pgTable(
  "account_billing",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    accountId: uuid("account_id")
      .references(() => accounts.id)
      .notNull(),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    subscriptionStatus: text("subscription_status"), // raw Stripe status
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    lastNudgeMonth: text("last_nudge_month"), // "YYYY-MM", UTC
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    accountUnique: uniqueIndex("account_billing_account_unique").on(table.accountId),
    customerUnique: uniqueIndex("account_billing_customer_unique")
      .on(table.stripeCustomerId)
      .where(sql`stripe_customer_id IS NOT NULL`),
  }),
);

export type AccountBilling = typeof accountBilling.$inferSelect;

/**
 * Per-account auto-sync config. One row per account (unique account_id). This
 * is CONFIG, not history — persona_source stays the append-only sync log. The
 * `secret` is the GitHub webhook HMAC signing secret, generated on first
 * enable and revealed to the owner (like a Stripe endpoint secret). `enabled`
 * pauses delivery handling without destroying the secret, so re-enabling is
 * instant and an already-installed GitHub hook keeps working. `webhook_id` is
 * the seam for a future server-side (OAuth) hook creation: null in manual mode.
 */
export const personaAutoSync = pgTable(
  "persona_auto_sync",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    accountId: uuid("account_id")
      .references(() => accounts.id)
      .notNull(),
    enabled: boolean("enabled").notNull().default(false),
    secret: text("secret").notNull(),
    webhookId: text("webhook_id"),
    // GitHub App installation id (stored as text; numeric but never used in
    // arithmetic). Set when the account connects via the GitHub App; null for
    // manual-webhook accounts. Unique-when-present.
    installationId: text("installation_id"),
    lastDeliveryAt: timestamp("last_delivery_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    accountUnique: uniqueIndex("persona_auto_sync_account_unique").on(table.accountId),
    installationUnique: uniqueIndex("persona_auto_sync_installation_unique")
      .on(table.installationId)
      .where(sql`installation_id IS NOT NULL`),
  }),
);

export type PersonaAutoSync = typeof personaAutoSync.$inferSelect;
export type NewPersonaAutoSync = typeof personaAutoSync.$inferInsert;
