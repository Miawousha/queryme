import fs from "node:fs";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { migrate as migrateNeon } from "drizzle-orm/neon-http/migrator";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import { migrate as migratePg } from "drizzle-orm/postgres-js/migrator";
import { neon } from "@neondatabase/serverless";
import postgres from "postgres";

// This script runs standalone via `tsx`, which (unlike Next.js) does not load
// `.env.local` automatically. Load it here so `pnpm db:migrate` works as the
// README documents, without needing the caller to export POSTGRES_URL.
if (fs.existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

/**
 * NOTE: This helper is duplicated in `lib/db/client.ts`. Keep them in sync.
 */
function isNeonHttpUrl(url: string): boolean {
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

async function main() {
  const url = process.env.POSTGRES_URL;
  if (!url) throw new Error("POSTGRES_URL is not set");

  console.log("Running migrations…");
  if (isNeonHttpUrl(url)) {
    const db = drizzleNeon({ client: neon(url) });
    await migrateNeon(db, { migrationsFolder: "./lib/db/migrations" });
  } else {
    const client = postgres(url, { max: 1 });
    const db = drizzlePg(client);
    await migratePg(db, { migrationsFolder: "./lib/db/migrations" });
    await client.end();
  }
  console.log("OK.");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
