import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getCachedPublicKbText } from "@/lib/kb/cache";
import { answer } from "@/lib/answerer";
import { convertToModelMessages, type UIMessage } from "ai";
import { getDb } from "@/lib/db/client";
import { getOrCreateConversation, appendTurn } from "@/lib/conversations/repo";
import { setInterviewer } from "@/lib/interviewer/repo";
import { buildIdentifyTools } from "@/lib/interviewer/tool";
import { getKv } from "@/lib/kv/client";
import { checkRateLimit } from "@/lib/kv/rate-limit";
import { requestIp } from "@/lib/request-ip";
import { getPersonaStore } from "@/lib/persona/store";
import { checkQuota } from "@/lib/usage/quota";
import { recordUsage } from "@/lib/usage/repo";
import { isUuid } from "@/lib/uuid";

/** Max messages per chat POST. Exported so the history endpoint's cap can be
 * derived from it (the seeded history is echoed back through this limit). */
export const MAX_TURNS = 50;
const MAX_TOTAL_USER_CHARS = 20_000;
// Per-part and all-roles ceilings. `messages` is fully client-supplied, so a
// caller can fabricate `assistant` turns of arbitrary size that flow straight
// into the paid model call. MAX_TOTAL_USER_CHARS only bounds user intent; these
// two bound the whole payload so fabricated history can't amplify token spend.
const MAX_PART_CHARS = 24_000;
const MAX_TOTAL_CHARS = 200_000;

// A UI message part. Text parts carry `text`; the AI SDK also produces
// non-text parts (e.g. `step-start`, reasoning) that get echoed back as
// conversation history on the 2nd turn onward — those must be accepted, not
// rejected. `.loose()` keeps any extra fields (e.g. `state`) intact for
// convertToModelMessages.
const UIMessagePartSchema = z
  .object({ type: z.string(), text: z.string().max(MAX_PART_CHARS).optional() })
  .loose();

const UIMessageSchema = z.object({
  id: z.string().optional(),
  // user/assistant only — the system prompt is server-assembled; accepting a
  // client `system` turn would let a visitor rewrite the agent's instructions.
  role: z.enum(["user", "assistant"]),
  parts: z.array(UIMessagePartSchema).min(1),
});

const RequestBodySchema = z.object({
  messages: z.array(UIMessageSchema).min(1).max(MAX_TURNS),
  conversationId: z.string().uuid().optional(),
  // The UI's active language at request time. Sticky per conversation: it is
  // only persisted on the conversation's first turn; later toggles are ignored
  // server-side so the cached KB lineage stays stable.
  language: z.enum(["en", "fr"]).optional(),
});

export async function handleChat(req: NextRequest, accountId: string): Promise<Response> {
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = RequestBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request shape" }, { status: 400 });
  }

  const charsFor = (roles: ReadonlyArray<"user" | "assistant">) =>
    parsed.data.messages
      .filter((m) => roles.includes(m.role))
      .reduce((n, m) => n + m.parts.reduce((p, part) => p + (part.text?.length ?? 0), 0), 0);

  if (charsFor(["user"]) > MAX_TOTAL_USER_CHARS) {
    return NextResponse.json(
      { error: `Conversation too long (max ${MAX_TOTAL_USER_CHARS} characters of user text)` },
      { status: 400 },
    );
  }
  if (charsFor(["user", "assistant"]) > MAX_TOTAL_CHARS) {
    return NextResponse.json(
      { error: `Conversation too long (max ${MAX_TOTAL_CHARS} characters total)` },
      { status: 400 },
    );
  }

  // Rate limit once the request is known well-formed but before the expensive
  // work — /api/chat calls the paid Anthropic API on every request, so an
  // unmetered loop is a direct cost-amplification vector.
  const rate = await checkRateLimit(getKv(), {
    key: `chat:${accountId}:ip:${requestIp(req)}`,
    limit: 30,
    windowSeconds: 60,
  });
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
  }

  // Account-wide limit on top of per-IP: requests spread across many IPs each
  // pass the per-IP limit, so one persona could still be hammered from a
  // distributed source without this ceiling.
  const accountRate = await checkRateLimit(getKv(), {
    key: `chat:${accountId}:account`,
    limit: 120,
    windowSeconds: 60,
  });
  if (!accountRate.allowed) {
    return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
  }

  await getPersonaStore().ensureReady(accountId);
  if (!getPersonaStore().getRoot(accountId)) {
    return NextResponse.json({ error: "persona_not_configured" }, { status: 503 });
  }

  const conversationId = parsed.data.conversationId ?? randomUUID();
  const db = getDb();

  // Quota is checked (and usage recorded) only for real, UUID-keyed accounts:
  // under PERSONA_LOCAL_OVERRIDE accountId is the non-UUID "local-override"
  // sentinel, which has no account_usage rows to read or write.
  const metered = isUuid(accountId);
  if (metered) {
    // Hard spend cap, enforced before any paid model call. The rate limits
    // above bound burst traffic; this bounds total daily/monthly spend.
    const quota = await checkQuota(db, accountId);
    if (!quota.allowed) {
      return NextResponse.json(
        {
          error: "quota_exceeded",
          reason: quota.reason,
          message: "This persona has reached its usage limit. Try again later.",
        },
        { status: 429 },
      );
    }
  }

  // Determine the conversation's preferred language; default to English for
  // fresh conversations until something sets it. The `language` field on the
  // request body is the UI's active language; it is only honoured when the
  // conversation row is being inserted (sticky-per-conversation).
  const conv = await getOrCreateConversation(db, {
    id: conversationId,
    channel: "chat",
    language: parsed.data.language,
    accountId,
  });
  const lang = (conv.language ?? parsed.data.language ?? "en") as "en" | "fr";
  const publicKbText = await getCachedPublicKbText(accountId, lang);

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
    accountId,
    messages: convertToModelMessages(parsed.data.messages as UIMessage[]),
    kbText: publicKbText,
    tools: {
      ...buildIdentifyTools((identity) => setInterviewer(db, conversationId, identity)),
    },
  });

  return result.toUIMessageStreamResponse({
    headers: { "x-conversation-id": conversationId },
    onFinish: async ({ messages: finalMessages }) => {
      // After the stream completes, append the assistant's full reply. This
      // runs after the response is already sent, so a throw here would surface
      // as an unhandled rejection — catch and log instead.
      try {
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
      } catch (err) {
        console.error("chat: failed to persist assistant turn", err);
      }

      // Meter the completed call. `totalUsage` resolves once the stream has
      // finished (guaranteed inside onFinish) and sums usage across all steps.
      // Like the transcript write above, a metering failure must never surface
      // — the response is already sent.
      if (metered) {
        try {
          const usage = await result.totalUsage;
          await recordUsage(db, {
            accountId,
            channel: "chat",
            inputTokens: usage.inputTokens ?? 0,
            outputTokens: usage.outputTokens ?? 0,
          });
        } catch (err) {
          console.error("chat: failed to record usage", err);
        }
      }
    },
  });
}
