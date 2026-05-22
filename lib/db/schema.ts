import { pgTable, uuid, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  channel: text("channel", { enum: ["chat", "mcp"] }).notNull(),
  language: text("language", { enum: ["en", "fr"] }),
  transcript: jsonb("transcript").$type<ConversationTurn[]>().notNull().default(sql`'[]'::jsonb`),
  interviewer: jsonb("interviewer").$type<InterviewerIdentity>(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
});

export const questionsForAlex = pgTable("questions_for_alex", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: uuid("conversation_id").references(() => conversations.id),
  question: text("question").notNull(),
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
export type QuestionForAlex = typeof questionsForAlex.$inferSelect;
