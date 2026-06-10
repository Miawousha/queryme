import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { getDailyUsageByAccount, utcDay } from "@/lib/usage/repo";
import { resendTransport, sendUsageAlert } from "@/lib/notify/email";

export const runtime = "nodejs";

/** Platform-wide daily token spend that triggers the alert email. */
const DEFAULT_DAILY_TOKEN_THRESHOLD = 1_000_000;

/** How many accounts to list in the alert body (rows arrive tokens-desc). */
const TOP_ACCOUNTS_IN_ALERT = 5;

function dailyTokenThreshold(): number {
  const parsed = Number(process.env.USAGE_ALERT_DAILY_TOKENS);
  return Number.isFinite(parsed) ? parsed : DEFAULT_DAILY_TOKEN_THRESHOLD;
}

/**
 * Daily spend alert, invoked by Vercel Cron just after midnight UTC (see
 * vercel.json). Aggregates the completed (previous) UTC day and emails the
 * platform operator when token spend crossed the threshold.
 */
export async function GET(req: NextRequest) {
  // Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`. When the secret
  // is unset we fail closed — always 401 — so a missing env var can never
  // leave the route open.
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // The cron fires shortly after midnight UTC; the alert covers the day that
  // just completed, not the few minutes of the current one.
  const day = utcDay(new Date(Date.now() - 24 * 60 * 60 * 1000));

  try {
    const rows = await getDailyUsageByAccount(getDb(), day);
    const totalMessages = rows.reduce((n, r) => n + r.messages, 0);
    const totalTokens = rows.reduce((n, r) => n + r.tokens, 0);

    let alerted = false;
    if (totalTokens >= dailyTokenThreshold()) {
      const r = await sendUsageAlert(resendTransport(), {
        to: process.env.USAGE_ALERT_TO ?? process.env.FORWARD_NOTIFICATION_TO ?? "",
        from: process.env.FORWARD_NOTIFICATION_FROM ?? "queritae@localhost",
        day,
        totals: { messages: totalMessages, tokens: totalTokens },
        topAccounts: rows.slice(0, TOP_ACCOUNTS_IN_ALERT),
      });
      if (!r.ok) console.error(`usage-alert: email send failed: ${r.error}`);
      alerted = r.ok;
    }

    return NextResponse.json({ ok: true, day, totalMessages, totalTokens, alerted });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
