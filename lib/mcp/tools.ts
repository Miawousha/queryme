import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { ModelMessage } from "ai";
import type { getDb } from "@/lib/db/client";
import type { KvClient } from "@/lib/kv/client";
import type { Conversation, ConversationTurn } from "@/lib/db/schema";
import type { getOrCreateConversation, appendTurn } from "@/lib/conversations/repo";
import type { isConversationUnlocked } from "@/lib/identity/tokens";
import type { forwardQuestion } from "@/lib/questions/repo";
import type { requestIdentification, verifyIdentification } from "@/lib/identity/service";

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

export const RequestIdentificationInputSchema = z.object({
  conversationId: z.string().uuid(),
  name: z.string().min(1).max(200),
  company: z.string().min(1).max(200),
  workEmail: z.string().email().max(320),
  role: z.string().min(1).max(200),
  purpose: z.string().max(2000).optional(),
});
export type RequestIdentificationInput = z.infer<typeof RequestIdentificationInputSchema>;

export const VerifyIdentificationInputSchema = z.object({
  conversationId: z.string().uuid(),
  workEmail: z.string().email().max(320),
  code: z.string().regex(/^\d{6}$/, "code must be 6 digits"),
});
export type VerifyIdentificationInput = z.infer<typeof VerifyIdentificationInputSchema>;

// --- ask ---

export type ProduceAnswerArgs = {
  messages: ModelMessage[];
  kbText: string;
  sensitiveKbText?: string;
};

// The handler only ever reads `transcript` off the conversation, so it depends
// on a structural minimum rather than the full `typeof getOrCreateConversation`
// return type — this also lets tests inject a lightweight in-memory store.
type ConversationLike = Pick<Conversation, "id" | "transcript">;

export type AskDeps = {
  db: Db;
  kv: KvClient;
  getOrCreateConversation: (
    db: Db,
    input: { id: string; channel: "chat" | "mcp"; language?: "en" | "fr" },
  ) => Promise<ConversationLike>;
  appendTurn: typeof appendTurn;
  isConversationUnlocked: typeof isConversationUnlocked;
  loadPublicKbText: () => Promise<string>;
  loadSensitiveKbText: () => Promise<string>;
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

  const unlocked = await deps.isConversationUnlocked(deps.kv, conversationId);

  const kbText = await deps.loadPublicKbText();
  const sensitiveKbText = unlocked ? await deps.loadSensitiveKbText() : "";

  // Reconstruct prior history from the stored transcript, then append the
  // new user question. MCP `ask` is stateless across calls — the transcript
  // is the source of truth.
  const messages: ModelMessage[] = [
    ...transcriptToMessages(conversation.transcript ?? []),
    { role: "user", content: input.question },
  ];

  await deps.appendTurn(deps.db, conversationId, {
    role: "user",
    text: input.question,
    at: new Date().toISOString(),
  });

  const answerText = await deps.produceAnswer({
    messages,
    kbText,
    sensitiveKbText: sensitiveKbText || undefined,
  });

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

// --- request_identification ---

export type RequestIdentificationDeps = {
  db: Db;
  kv: KvClient;
  requestIdentification: typeof requestIdentification;
  send: Parameters<typeof requestIdentification>[0]["send"];
};

export type RequestIdentificationResult =
  | { ok: true }
  | { ok: false; error: string };

export async function handleRequestIdentification(
  deps: RequestIdentificationDeps,
  rawInput: unknown,
): Promise<RequestIdentificationResult> {
  const input = RequestIdentificationInputSchema.parse(rawInput);

  const result = await deps.requestIdentification(
    { db: deps.db, kv: deps.kv, send: deps.send },
    {
      conversationId: input.conversationId,
      name: input.name,
      company: input.company,
      workEmail: input.workEmail,
      role: input.role,
      purpose: input.purpose,
    },
  );

  if (!result.ok) {
    return {
      ok: false,
      error:
        result.reason === "invalid_email_domain"
          ? "A work email from a company domain is required (free-email providers are not accepted)."
          : `Identification request failed: ${result.reason}`,
    };
  }

  return { ok: true };
}

// --- verify_identification ---

export type VerifyIdentificationDeps = {
  db: Db;
  kv: KvClient;
  verifyIdentification: typeof verifyIdentification;
};

export type VerifyIdentificationResult =
  | { ok: true }
  | { ok: false; error: string };

export async function handleVerifyIdentification(
  deps: VerifyIdentificationDeps,
  rawInput: unknown,
): Promise<VerifyIdentificationResult> {
  const input = VerifyIdentificationInputSchema.parse(rawInput);

  const result = await deps.verifyIdentification(
    { db: deps.db, kv: deps.kv },
    {
      conversationId: input.conversationId,
      workEmail: input.workEmail,
      code: input.code,
    },
  );

  if (!result.ok) {
    return {
      ok: false,
      error:
        result.reason === "code_invalid"
          ? "The verification code is invalid or has expired."
          : "No matching identification request was found for this email.",
    };
  }

  return { ok: true };
}
