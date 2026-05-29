import fs from "node:fs";
import { run } from "./lib/admin-run";

// Standalone tsx scripts don't auto-load .env.local (Next.js does). Match the
// other scripts so `pnpm admin` picks up POSTGRES_URL / ADMIN_PASSWORD locally.
if (fs.existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

run(process.argv.slice(2), {
  env: process.env,
  isTTY: Boolean(process.stdout.isTTY),
})
  .then(({ exitCode, stdout }) => {
    if (stdout) process.stdout.write(stdout + "\n");
    process.exit(exitCode);
  })
  .catch((err) => {
    process.stderr.write(`unexpected: ${err instanceof Error ? err.stack : String(err)}\n`);
    process.exit(1);
  });
