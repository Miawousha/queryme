import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { loadKb } from "@/lib/kb/loader";
import { assemblePublicKbText } from "@/lib/kb/assembler";
import { answer } from "@/lib/answerer";
import { convertToModelMessages, type UIMessage } from "ai";
import { getDb } from "@/lib/db/client";
import { getOrCreateConversation, appendTurn } from "@/lib/conversations/repo";

export const runtime = "nodejs";

const MAX_TURNS = 50;
const MAX_TOTAL_USER_CHARS = 20_000;

// A UI message part. Text parts carry `text`; the AI SDK also produces
// non-text parts (e.g. `step-start`, reasoning) that get echoed back as
// conversation history on the 2nd turn onward — those must be accepted, not
// rejected. `.loose()` keeps any extra fields (e.g. `state`) intact for
// convertToModelMessages.
const UIMessagePartSchema = z
  .object({ type: z.string(), text: z.string().optional() })
  .loose();

const UIMessageSchema = z.object({
  id: z.string().optional(),
  role: z.enum(["user", "assistant", "system"]),
  parts: z.array(UIMessagePartSchema).min(1),
});

const RequestBodySchema = z.object({
  messages: z.array(UIMessageSchema).min(1).max(MAX_TURNS),
  conversationId: z.string().uuid().optional(),
});

let cachedPublicKbText: string | null = null;

async function getPublicKbText(): Promise<string> {
  if (cachedPublicKbText !== null) return cachedPublicKbText;
  const kbDir = path.resolve(process.cwd(), "kb");
  const kb = await loadKb(kbDir);
  cachedPublicKbText = assemblePublicKbText(kb);
  return cachedPublicKbText;
}

export async function POST(req: NextRequest) {
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = RequestBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request shape", details: parsed.error.issues }, { status: 400 });
  }

  const userCharCount = parsed.data.messages
    .filter((m) => m.role === "user")
    .reduce((n, m) => n + m.parts.reduce((p, part) => p + (part.text?.length ?? 0), 0), 0);
  if (userCharCount > MAX_TOTAL_USER_CHARS) {
    return NextResponse.json(
      { error: `Conversation too long (max ${MAX_TOTAL_USER_CHARS} characters of user text)` },
      { status: 400 },
    );
  }

  const conversationId = parsed.data.conversationId ?? randomUUID();
  const db = getDb();

  await getOrCreateConversation(db, { id: conversationId, channel: "chat" });

  const publicKbText = await getPublicKbText();

  // Append the last user turn to the transcript before streaming.
  const lastMessage = parsed.data.messages[parsed.data.messages.length - 1];
  if (lastMessage.role === "user") {
    const text = lastMessage.parts.map((p) => p.text ?? "").join("");
    await appendTurn(db, conversationId, {
      role: "user",
      text,
      at: new Date().toISOString(),
    });
  }

  const result = await answer({
    messages: convertToModelMessages(parsed.data.messages as UIMessage[]),
    kbText: publicKbText,
  });

  return result.toUIMessageStreamResponse({
    headers: { "x-conversation-id": conversationId },
    onFinish: async ({ messages: finalMessages }) => {
      // After the stream completes, append the assistant's full reply.
      const last = finalMessages[finalMessages.length - 1];
      if (last && last.role === "assistant") {
        const text = last.parts
          .filter((p): p is { type: "text"; text: string } => p.type === "text")
          .map((p) => p.text)
          .join("");
        await appendTurn(db, conversationId, {
          role: "assistant",
          text,
          at: new Date().toISOString(),
        });
      }
    },
  });
}
