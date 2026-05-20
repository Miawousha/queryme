import { randomBytes } from "node:crypto";
import type { KvClient } from "../kv/client";

export const TOKEN_TTL_SECONDS = 60 * 60 * 24; // 24 hours

function tokenKey(token: string) { return `tok:${token}`; }
function convKey(conversationId: string) { return `conv-unlocked:${conversationId}`; }

export async function issueToken(
  kv: KvClient,
  input: { conversationId: string },
): Promise<{ token: string }> {
  const token = randomBytes(24).toString("base64url");
  await kv.set(tokenKey(token), input.conversationId, { ex: TOKEN_TTL_SECONDS });
  await kv.set(convKey(input.conversationId), "1", { ex: TOKEN_TTL_SECONDS });
  return { token };
}

export type ValidateResult = { ok: true; conversationId: string } | { ok: false };

export async function validateToken(kv: KvClient, input: { token: string }): Promise<ValidateResult> {
  const conversationId = await kv.get(tokenKey(input.token));
  if (!conversationId) return { ok: false };
  return { ok: true, conversationId };
}

export async function isConversationUnlocked(kv: KvClient, conversationId: string): Promise<boolean> {
  return (await kv.get(convKey(conversationId))) !== null;
}
