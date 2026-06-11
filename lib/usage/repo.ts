import { and, eq, gte, sql } from "drizzle-orm";
import { accountUsage } from "@/lib/db/schema";
import type { getDb } from "@/lib/db/client";

type Db = ReturnType<typeof getDb>;

export type UsageChannel = "chat" | "mcp";

/** UTC calendar day ("YYYY-MM-DD") for a given instant. */
export function utcDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** First day of the UTC calendar month containing `now`. */
export function utcMonthStart(now: Date = new Date()): string {
  return `${now.toISOString().slice(0, 8)}01`;
}

/**
 * Increment the (account, day, channel) usage row by one message and the given
 * token counts. Atomic upsert — concurrent requests can never lose increments.
 */
export async function recordUsage(
  db: Db,
  input: {
    accountId: string;
    channel: UsageChannel;
    inputTokens: number;
    outputTokens: number;
    now?: Date;
  },
): Promise<void> {
  // Token counts come from the model API; NaN (e.g. an aborted stream that
  // never reported usage) must not poison the counter — count the message,
  // zero the tokens.
  const inTok = Number.isFinite(input.inputTokens) ? Math.max(0, Math.round(input.inputTokens)) : 0;
  const outTok = Number.isFinite(input.outputTokens) ? Math.max(0, Math.round(input.outputTokens)) : 0;

  await db
    .insert(accountUsage)
    .values({
      accountId: input.accountId,
      day: utcDay(input.now),
      channel: input.channel,
      messages: 1,
      inputTokens: inTok,
      outputTokens: outTok,
    })
    .onConflictDoUpdate({
      target: [accountUsage.accountId, accountUsage.day, accountUsage.channel],
      set: {
        messages: sql`${accountUsage.messages} + 1`,
        inputTokens: sql`${accountUsage.inputTokens} + ${inTok}`,
        outputTokens: sql`${accountUsage.outputTokens} + ${outTok}`,
        updatedAt: sql`now()`,
      },
    });
}

export type UsageTotals = {
  /** Messages across all channels today (UTC). */
  dayMessages: number;
  /** Messages across all channels this UTC calendar month. */
  monthMessages: number;
  /** input + output tokens across all channels this UTC calendar month. */
  monthTokens: number;
};

/** Aggregates for quota checks: today's messages, this month's tokens. */
export async function getUsageTotals(
  db: Db,
  accountId: string,
  now: Date = new Date(),
): Promise<UsageTotals> {
  const day = utcDay(now);
  const [row] = await db
    .select({
      dayMessages: sql<number>`coalesce(sum(${accountUsage.messages}) filter (where ${accountUsage.day} = ${day}), 0)::int`,
      monthMessages: sql<number>`coalesce(sum(${accountUsage.messages}), 0)::int`,
      monthTokens: sql<number>`coalesce(sum(${accountUsage.inputTokens} + ${accountUsage.outputTokens}), 0)::int`,
    })
    .from(accountUsage)
    .where(and(eq(accountUsage.accountId, accountId), gte(accountUsage.day, utcMonthStart(now))));
  return { dayMessages: row?.dayMessages ?? 0, monthMessages: row?.monthMessages ?? 0, monthTokens: row?.monthTokens ?? 0 };
}

export type PlatformUsageRow = {
  accountId: string;
  username: string;
  messages: number;
  tokens: number;
};

/**
 * Per-account usage for a single UTC day, descending by tokens — the daily
 * spend-alert digest. Returns every account with any usage that day.
 */
export async function getDailyUsageByAccount(
  db: Db,
  day: string,
): Promise<PlatformUsageRow[]> {
  const rows = await db
    .select({
      accountId: accountUsage.accountId,
      messages: sql<number>`sum(${accountUsage.messages})::int`,
      tokens: sql<number>`sum(${accountUsage.inputTokens} + ${accountUsage.outputTokens})::int`,
    })
    .from(accountUsage)
    .where(eq(accountUsage.day, day))
    .groupBy(accountUsage.accountId)
    .orderBy(sql`sum(${accountUsage.inputTokens} + ${accountUsage.outputTokens}) desc`);
  if (rows.length === 0) return [];

  // Resolve usernames in one pass (the join table is tiny — one row per
  // account per day).
  const { accounts } = await import("@/lib/db/schema");
  const accountRows = await db.select({ id: accounts.id, username: accounts.username }).from(accounts);
  const nameById = new Map(accountRows.map((a) => [a.id, a.username]));
  return rows.map((r) => ({
    accountId: r.accountId,
    username: nameById.get(r.accountId) ?? r.accountId,
    messages: r.messages,
    tokens: r.tokens,
  }));
}
