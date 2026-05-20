import { eq, sql } from "drizzle-orm";
import { askers, conversations } from "@/lib/db/schema";
import { isLikelyWorkEmail } from "./email-domain";
import { issueCode, verifyCode } from "./codes";
import { issueToken } from "./tokens";
import { sendVerificationCode } from "./resend";
import type { KvClient } from "@/lib/kv/client";
import type { getDb } from "@/lib/db/client";

type Db = ReturnType<typeof getDb>;

export type RequestIdentityInput = {
  conversationId: string;
  name: string;
  company: string;
  workEmail: string;
  role: string;
  purpose?: string;
};

export type RequestIdentityResult =
  | { ok: true }
  | { ok: false; reason: "invalid_email_domain" };

export async function requestIdentification(
  deps: { db: Db; kv: KvClient; send: typeof sendVerificationCode },
  input: RequestIdentityInput,
): Promise<RequestIdentityResult> {
  if (!isLikelyWorkEmail(input.workEmail)) {
    return { ok: false, reason: "invalid_email_domain" };
  }

  const email = input.workEmail.trim().toLowerCase();

  // Upsert asker (no verification yet)
  await deps.db
    .insert(askers)
    .values({
      name: input.name,
      company: input.company,
      workEmail: email,
      role: input.role,
      purpose: input.purpose,
    })
    .onConflictDoUpdate({
      target: askers.workEmail,
      set: {
        name: input.name,
        company: input.company,
        role: input.role,
        purpose: input.purpose,
      },
    });

  const { code } = await issueCode(deps.kv, { conversationId: input.conversationId, email });

  await deps.send({ to: email, code, recipientName: input.name });

  return { ok: true };
}

export type VerifyIdentityInput = {
  conversationId: string;
  workEmail: string;
  code: string;
};

export type VerifyIdentityResult =
  | { ok: true; token: string; askerId: string }
  | { ok: false; reason: "code_invalid" | "asker_not_found" };

export async function verifyIdentification(
  deps: { db: Db; kv: KvClient },
  input: VerifyIdentityInput,
): Promise<VerifyIdentityResult> {
  const email = input.workEmail.trim().toLowerCase();
  const v = await verifyCode(deps.kv, { conversationId: input.conversationId, email, code: input.code });
  if (!v.ok) return { ok: false, reason: "code_invalid" };

  // Mark asker verified, fetch id
  const rows = await deps.db
    .update(askers)
    .set({ verifiedAt: sql`now()` })
    .where(eq(askers.workEmail, email))
    .returning({ id: askers.id });

  if (rows.length === 0) return { ok: false, reason: "asker_not_found" };
  const askerId = rows[0].id;

  // Mark conversation unlocked + associate asker
  await deps.db
    .update(conversations)
    .set({
      sensitiveUnlockedAt: sql`now()`,
      askerId,
    })
    .where(eq(conversations.id, input.conversationId));

  const { token } = await issueToken(deps.kv, { conversationId: input.conversationId });
  return { ok: true, token, askerId };
}
