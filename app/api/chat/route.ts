import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { z } from "zod";
import { loadKb } from "@/lib/kb/loader";
import { assembleKbText } from "@/lib/kb/assembler";
import { answer } from "@/lib/answerer";
import { convertToModelMessages, type UIMessage } from "ai";

export const runtime = "nodejs";

const MAX_TURNS = 50;
const MAX_TOTAL_USER_CHARS = 20_000;

const UIMessagePartSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});

const UIMessageSchema = z.object({
  id: z.string().optional(),
  role: z.enum(["user", "assistant", "system"]),
  parts: z.array(UIMessagePartSchema).min(1),
});

const RequestBodySchema = z.object({
  messages: z.array(UIMessageSchema).min(1).max(MAX_TURNS),
});

let cachedKbText: string | null = null;

async function getKbText(): Promise<string> {
  if (cachedKbText !== null) return cachedKbText;
  const kbDir = path.resolve(process.cwd(), "kb");
  const kb = await loadKb(kbDir);
  cachedKbText = assembleKbText(kb);
  return cachedKbText;
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
    .reduce((n, m) => n + m.parts.reduce((p, part) => p + part.text.length, 0), 0);

  if (userCharCount > MAX_TOTAL_USER_CHARS) {
    return NextResponse.json(
      { error: `Conversation too long (max ${MAX_TOTAL_USER_CHARS} characters of user text)` },
      { status: 400 },
    );
  }

  const kbText = await getKbText();

  const result = await answer({
    messages: convertToModelMessages(parsed.data.messages as UIMessage[]),
    kbText,
  });

  return result.toUIMessageStreamResponse();
}
