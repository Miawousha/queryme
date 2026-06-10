import { pgTable, uuid, text, timestamp, jsonb, index, uniqueIndex, date, integer } from "drizzle-orm/pg-core";
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

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    githubId: text("github_id"), // unique-when-present (see index below)
    username: text("username").notNull().unique(),
    role: text("role", { enum: ["user", "admin"] }).notNull().default("user"),
    status: text("status", { enum: ACCOUNT_STATUSES }).notNull().default("waitlisted"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
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
