import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { ModelMessage } from "ai";
import type { getDb } from "@/lib/db/client";
import type { Conversation, ConversationTurn } from "@/lib/db/schema";
import type { getOrCreateConversation, appendTurn } from "@/lib/conversations/repo";
import type { forwardQuestion } from "@/lib/questions/repo";

type Db = ReturnType<typeof getDb>;

// --- Zod input schemas (also re-used by lib/mcp/server.ts) ---

export const AskInputSchema = z.object({
  question: z.string().min(1).max(4000),
  conversationId: z.string().uuid().optional(),
});
export type AskInput = z.infer<typeof AskInputSchema>;

export const ForwardQuestionInputSchema = z.object({
  question: z.string().min(1).max(4000),
  conversationId: z.string().uuid().optional(),
});
export type ForwardQuestionInput = z.infer<typeof ForwardQuestionInputSchema>;

// --- ask ---

// Cap on how many prior transcript turns are replayed into the model on each
// `ask` call. Mirrors `MAX_TURNS` in app/api/chat/route.ts so a long-lived MCP
// conversation does not grow its message array unbounded (2 turns per call).
const MAX_HISTORY_TURNS = 50;

export type ProduceAnswerArgs = {
  messages: ModelMessage[];
  kbText: string;
  conversationId: string;
};

// The handler only ever reads `transcript` off the conversation, so it depends
// on a structural minimum rather than the full `typeof getOrCreateConversation`
// return type — this also lets tests inject a lightweight in-memory store.
type ConversationLike = Pick<Conversation, "id" | "transcript">;

export type AskDeps = {
  db: Db;
  getOrCreateConversation: (
    db: Db,
    input: { id: string; channel: "chat" | "mcp"; language?: "en" | "fr" },
  ) => Promise<ConversationLike>;
  appendTurn: typeof appendTurn;
  loadPublicKbText: () => Promise<string>;
  produceAnswer: (args: ProduceAnswerArgs) => Promise<string>;
};

export type AskResult = { answer: string; conversationId: string };

function transcriptToMessages(transcript: ConversationTurn[]): ModelMessage[] {
  return transcript.map((turn) => ({ role: turn.role, content: turn.text }));
}

export async function handleAsk(deps: AskDeps, rawInput: unknown): Promise<AskResult> {
  const input = AskInputSchema.parse(rawInput);
  const conversationId = input.conversationId ?? randomUUID();

  const conversation: ConversationLike = await deps.getOrCreateConversation(deps.db, {
    id: conversationId,
    channel: "mcp",
  });

  const kbText = await deps.loadPublicKbText();

  // Reconstruct prior history from the stored transcript, then append the
  // new user question. MCP `ask` is stateless across calls — the transcript
  // is the source of truth. Cap the replayed history to the most recent
  // MAX_HISTORY_TURNS turns so the message array stays bounded.
  const priorHistory = (conversation.transcript ?? []).slice(-MAX_HISTORY_TURNS);
  const messages: ModelMessage[] = [
    ...transcriptToMessages(priorHistory),
    { role: "user", content: input.question },
  ];

  await deps.appendTurn(deps.db, conversationId, {
    role: "user",
    text: input.question,
    at: new Date().toISOString(),
  });

  const answerText = await deps.produceAnswer({ messages, kbText, conversationId });

  await deps.appendTurn(deps.db, conversationId, {
    role: "assistant",
    text: answerText,
    at: new Date().toISOString(),
  });

  return { answer: answerText, conversationId };
}

// --- forward_question ---

export type ForwardQuestionDeps = {
  db: Db;
  forwardQuestion: typeof forwardQuestion;
};

export type ForwardQuestionResult = { ok: true; id: string };

export async function handleForwardQuestion(
  deps: ForwardQuestionDeps,
  rawInput: unknown,
): Promise<ForwardQuestionResult> {
  const input = ForwardQuestionInputSchema.parse(rawInput);
  const conversationId = input.conversationId ?? randomUUID();

  const inserted = await deps.forwardQuestion(deps.db, {
    question: input.question,
    conversationId,
  });

  return { ok: true, id: inserted.id };
}
