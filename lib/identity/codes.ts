import { randomInt } from "node:crypto";
import type { KvClient } from "../kv/client";

const CODE_TTL_SECONDS = 60 * 10; // 10 minutes

function keyFor(conversationId: string, email: string) {
  return `code:${conversationId}:${email.trim().toLowerCase()}`;
}

export async function issueCode(
  kv: KvClient,
  input: { conversationId: string; email: string },
): Promise<{ code: string }> {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await kv.set(keyFor(input.conversationId, input.email), code, { ex: CODE_TTL_SECONDS });
  return { code };
}

export type VerifyResult = { ok: true } | { ok: false; reason: "not_found" | "mismatch" };

export async function verifyCode(
  kv: KvClient,
  input: { conversationId: string; email: string; code: string },
): Promise<VerifyResult> {
  const stored = await kv.get(keyFor(input.conversationId, input.email));
  if (stored === null) return { ok: false, reason: "not_found" };
  if (stored !== input.code) return { ok: false, reason: "mismatch" };
  await kv.del(keyFor(input.conversationId, input.email));
  return { ok: true };
}
