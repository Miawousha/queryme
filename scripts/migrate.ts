import fs from "node:fs";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";
import { neon } from "@neondatabase/serverless";

// This script runs standalone via `tsx`, which (unlike Next.js) does not load
// `.env.local` automatically. Load it here so `pnpm db:migrate` works as the
// README documents, without needing the caller to export POSTGRES_URL.
if (fs.existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

async function main() {
  const url = process.env.POSTGRES_URL;
  if (!url) throw new Error("POSTGRES_URL is not set");

  const sql = neon(url);
  const db = drizzle({ client: sql });

  console.log("Running migrations…");
  await migrate(db, { migrationsFolder: "./lib/db/migrations" });
  console.log("OK.");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
