import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import { neon } from "@neondatabase/serverless";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import postgres from "postgres";

/**
 * Picks a Drizzle driver based on the URL shape. Neon hosts (matched by host
 * suffix) use the HTTP driver — required for Vercel's edge runtime and for
 * Vercel Postgres / Neon. Everything else (a vanilla Postgres container, RDS,
 * a local instance) uses the standard TCP driver via `postgres-js`. Same
 * Drizzle schema, same migrations, same query API; only the transport
 * differs.
 *
 * NOTE: This helper is duplicated in `scripts/migrate.ts`. Keep them in sync.
 */
function isNeonHttpUrl(url: string): boolean {
  // Match `*.neon.tech` (paid), `*.neon.dev` (free), and the Vercel Postgres
  // hostnames which proxy to Neon under the hood.
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

// Both `NeonHttpDatabase` and `PostgresJsDatabase` extend `PgDatabase` from
// drizzle-orm/pg-core. Returning the shared base type avoids a union of two
// driver-specific generics, which TypeScript can't reconcile across overloaded
// methods like `.returning({ ... })` on update/insert builders.
type Db = PgDatabase<PgQueryResultHKT>;

export function makeDb(connectionString: string): Db {
  if (isNeonHttpUrl(connectionString)) {
    return drizzleNeon({ client: neon(connectionString) });
  }
  return drizzlePg(postgres(connectionString));
}

let cached: Db | null = null;

export function getDb(): Db {
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
