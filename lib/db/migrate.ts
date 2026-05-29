import fs from "node:fs";
import path from "node:path";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { migrate as migrateNeon } from "drizzle-orm/neon-http/migrator";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import { migrate as migratePg } from "drizzle-orm/postgres-js/migrator";
import { neon } from "@neondatabase/serverless";
import postgres from "postgres";

export const MIGRATIONS_FOLDER = "./lib/db/migrations";

export type JournalEntry = { idx: number; when: number; tag: string };

/**
 * Picks a Drizzle migrator by URL host. Neon hosts use the HTTP driver; every
 * other host uses the standard TCP driver via postgres-js. (Mirrors the
 * routing in lib/db/client.ts.)
 */
export function isNeonHttpUrl(url: string): boolean {
  try {
    const host = new URL(url).host;
    return (
      /\.neon\.tech$/.test(host) ||
      /\.neon\.dev$/.test(host) ||
      /\.vercel-storage\.com$/.test(host)
    );
  } catch {
    return false;
  }
}

export async function runMigrations(url: string): Promise<void> {
  if (isNeonHttpUrl(url)) {
    const db = drizzleNeon({ client: neon(url) });
    await migrateNeon(db, { migrationsFolder: MIGRATIONS_FOLDER });
  } else {
    const client = postgres(url, { max: 1 });
    const db = drizzlePg(client);
    await migratePg(db, { migrationsFolder: MIGRATIONS_FOLDER });
    await client.end();
  }
}

/** Reads the drizzle migration journal (source of truth for migration order). */
export function readJournal(folder = MIGRATIONS_FOLDER): JournalEntry[] {
  const journalPath = path.join(folder, "meta", "_journal.json");
  const raw = JSON.parse(fs.readFileSync(journalPath, "utf8")) as {
    entries: JournalEntry[];
  };
  return raw.entries;
}

/**
 * Pure pending-detection: a journal entry is pending iff its `when` timestamp
 * is strictly greater than the last-applied millis. This mirrors drizzle's own
 * apply condition (`lastDbMigration.created_at < migration.folderMillis`).
 */
export function pendingFromJournal(
  entries: JournalEntry[],
  lastAppliedMillis: number,
): string[] {
  return entries.filter((e) => e.when > lastAppliedMillis).map((e) => e.tag);
}

/**
 * Reads the greatest `created_at` (epoch ms) from drizzle's bookkeeping table.
 * Returns 0 when no migrations have run yet (table absent or empty).
 */
async function lastAppliedMillis(url: string): Promise<number> {
  const sqlText =
    "select created_at from drizzle.__drizzle_migrations order by created_at desc limit 1";
  try {
    if (isNeonHttpUrl(url)) {
      const sql = neon(url);
      const rows = (await sql.query(sqlText)) as Array<{
        created_at: string | number;
      }>;
      return rows.length ? Number(rows[0].created_at) : 0;
    }
    const client = postgres(url, { max: 1 });
    try {
      const rows = await client.unsafe<Array<{ created_at: string | number }>>(
        sqlText,
      );
      return rows.length ? Number(rows[0].created_at) : 0;
    } finally {
      await client.end();
    }
  } catch {
    // Table does not exist yet → nothing applied.
    return 0;
  }
}

export async function listPendingMigrations(url: string): Promise<string[]> {
  const entries = readJournal();
  const last = await lastAppliedMillis(url);
  return pendingFromJournal(entries, last);
}
