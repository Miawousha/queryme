import { claimNudge } from "@/lib/billing/repo";
import { getAccountById } from "@/lib/accounts/repo";
import { ownerNotifyAddress } from "@/lib/notify/owner-email";
import { sendUpgradeNudge, resendTransport, type EmailTransport } from "@/lib/notify/email";
import { FREE_MONTHLY_ANSWERS } from "@/lib/billing/plan";
import { siteUrl } from "@/lib/billing/checkout";
import type { getDb } from "@/lib/db/client";

type Db = ReturnType<typeof getDb>;

export type NudgeDeps = {
  db: Db;
  claimNudge: typeof claimNudge;
  getAccountById: typeof getAccountById;
  ownerNotifyAddress: typeof ownerNotifyAddress;
  transport: EmailTransport;
  from: string;
  siteUrl: string;
};

/**
 * Email the owner the first time their free allowance is hit each month.
 * `claimNudge` makes the once-per-month guarantee atomic across concurrent
 * refusals. Never throws — the caller is the chat refusal path and an email
 * failure must not change its response.
 */
export async function maybeSendUpgradeNudge(
  deps: NudgeDeps,
  accountId: string,
  now: Date = new Date(),
): Promise<void> {
  try {
    const month = now.toISOString().slice(0, 7); // "YYYY-MM", UTC
    if (!(await deps.claimNudge(deps.db, accountId, month))) return;
    const account = await deps.getAccountById(deps.db, accountId);
    if (!account) {
      console.warn("billing: nudge claimed but account missing", accountId);
      return;
    }
    const to = await deps.ownerNotifyAddress(accountId);
    if (!to) {
      console.warn("billing: nudge claimed but no recipient address", accountId);
      return;
    }
    const result = await sendUpgradeNudge(deps.transport, {
      to,
      from: deps.from,
      username: account.username,
      freeAllowance: FREE_MONTHLY_ANSWERS,
      billingUrl: `${deps.siteUrl}/${account.username}/admin/settings/billing`,
    });
    if (!result.ok) console.error("billing: upgrade nudge send failed", result.error);
  } catch (err) {
    console.error("billing: upgrade nudge failed", err);
  }
}

/** Production wiring for the chat handler. */
export function nudgeDeps(db: Db): NudgeDeps {
  return {
    db,
    claimNudge,
    getAccountById,
    ownerNotifyAddress,
    transport: resendTransport(),
    from: process.env.FORWARD_NOTIFICATION_FROM ?? "queritae@localhost",
    siteUrl: siteUrl(),
  };
}
