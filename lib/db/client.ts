import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";

export function makeDb(connectionString: string) {
  const sql = neon(connectionString);
  return drizzle({ client: sql });
}

let cached: ReturnType<typeof makeDb> | null = null;

export function getDb() {
  if (cached) return cached;
  const url = process.env.POSTGRES_URL;
  if (!url) {
    throw new Error(
      "POSTGRES_URL is not set. Configure it in .env.local (local) or Vercel env (production).",
    );
  }
  cached = makeDb(url);
  return cached;
}
