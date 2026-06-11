import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { ModelMessage } from "ai";
import type { getDb } from "@/lib/db/client";
import type { Conversation, ConversationTurn } from "@/lib/db/schema";
import type { getOrCreateConversation, appendTurn } from "@/lib/conversations/repo";
import type { forwardQuestion } from "@/lib/questions/repo";
import type { checkQuota } from "@/lib/usage/quota";
import type { recordUsage } from "@/lib/usage/repo";
import { isUuid } from "@/lib/uuid";
import { MAX_TURNS } from "@/lib/chat/limits";

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
// `ask` call. Sourced from lib/chat/limits so a long-lived MCP conversation
// does not grow its message array unbounded (2 turns per call).
const MAX_HISTORY_TURNS = MAX_TURNS;

export type ProduceAnswerArgs = {
  messages: ModelMessage[];
  kbText: string;
  conversationId: string;
};

export type ProducedAnswer = {
  text: string;
  /**
   * Total token usage across all model steps. Fields are `undefined` when the
   * provider did not report usage (e.g. aborted stream) — recordUsage treats
   * that as zero tokens, still counting the message.
   */
  usage: { inputTokens: number | undefined; outputTokens: number | undefined };
};

// The handler only ever reads `transcript` off the conversation, so it depends
// on a structural minimum rather than the full `typeof getOrCreateConversation`
// return type — this also lets tests inject a lightweight in-memory store.
type ConversationLike = Pick<Conversation, "id" | "transcript">;

export type AskDeps = {
  db: Db;
  /**
   * Account the persona belongs to. Quota + usage metering apply only when
   * this is a real UUID — under PERSONA_LOCAL_OVERRIDE it is the non-UUID
   * "local-override" sentinel, which has no account_usage rows.
   */
  accountId: string;
  getOrCreateConversation: (
    db: Db,
    input: { id: string; channel: "chat" | "mcp"; language?: "en" | "fr" },
  ) => Promise<ConversationLike>;
  appendTurn: typeof appendTurn;
  loadPublicKbText: () => Promise<string>;
  produceAnswer: (args: ProduceAnswerArgs) => Promise<ProducedAnswer>;
  checkQuota: typeof checkQuota;
  recordUsage: typeof recordUsage;
};

export type AskResult = { answer: string; conversationId: string };

function transcriptToMessages(transcript: ConversationTurn[]): ModelMessage[] {
  return transcript.map((turn) => ({ role: turn.role, content: turn.text }));
}

export async function handleAsk(deps: AskDeps, rawInput: unknown): Promise<AskResult> {
  const input = AskInputSchema.parse(rawInput);

  // Hard spend cap, enforced before any paid model call. Thrown like a zod
  // validation failure — the server wrapper maps it to an MCP tool error.
  const metered = isUuid(deps.accountId);
  if (metered) {
    const quota = await deps.checkQuota(deps.db, deps.accountId);
    if (!quota.allowed) {
      throw new Error(
        `quota_exceeded (${quota.reason}): This persona has reached its usage limit. Try again later.`,
      );
    }
  }

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

  const produced = await deps.produceAnswer({ messages, kbText, conversationId });

  // Meter the completed call. The answer is already produced — a metering
  // failure must not turn it into a tool error, so log and continue.
  if (metered) {
    try {
      await deps.recordUsage(deps.db, {
        accountId: deps.accountId,
        channel: "mcp",
        inputTokens: produced.usage.inputTokens ?? 0,
        outputTokens: produced.usage.outputTokens ?? 0,
      });
    } catch (err) {
      console.error("mcp ask: failed to record usage", err);
    }
  }

  await deps.appendTurn(deps.db, conversationId, {
    role: "assistant",
    text: produced.text,
    at: new Date().toISOString(),
  });

  return { answer: produced.text, conversationId };
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

  // Pass the client-supplied conversationId through as-is. When omitted the
  // column is left NULL — synthesizing a random UUID here would violate the
  // conversation_id FK, since no matching conversation row exists. (Mirrors
  // the web handler in lib/questions/handle-forward.ts.)
  const inserted = await deps.forwardQuestion(deps.db, {
    question: input.question,
    conversationId: input.conversationId,
  });

  return { ok: true, id: inserted.id };
}
