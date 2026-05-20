import { pgTable, uuid, text, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const askers = pgTable("askers", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  company: text("company").notNull(),
  workEmail: text("work_email").notNull().unique(),
  role: text("role").notNull(),
  purpose: text("purpose"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  askerId: uuid("asker_id").references(() => askers.id),
  channel: text("channel", { enum: ["chat", "mcp"] }).notNull(),
  language: text("language", { enum: ["en", "fr"] }),
  transcript: jsonb("transcript").$type<ConversationTurn[]>().notNull().default(sql`'[]'::jsonb`),
  sensitiveUnlockedAt: timestamp("sensitive_unlocked_at", { withTimezone: true }),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
});

export const questionsForAlex = pgTable("questions_for_alex", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: uuid("conversation_id").references(() => conversations.id),
  askerId: uuid("asker_id").references(() => askers.id),
  question: text("question").notNull(),
  answeredAt: timestamp("answered_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ConversationTurn = {
  role: "user" | "assistant";
  text: string;
  at: string; // ISO timestamp
};

export type Asker = typeof askers.$inferSelect;
export type NewAsker = typeof askers.$inferInsert;
export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
export type QuestionForAlex = typeof questionsForAlex.$inferSelect;
