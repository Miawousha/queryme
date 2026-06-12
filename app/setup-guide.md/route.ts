import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

// Served as one document: agent preamble first, then the full content-repo
// guide verbatim — the same file that documents the schemas the sync
// validates with, so what agents fetch cannot drift from validation.
export async function GET() {
  const parts = await Promise.all([
    readFile(path.join(process.cwd(), "docs", "agent-setup-preamble.md"), "utf8"),
    readFile(path.join(process.cwd(), "docs", "content-repo-guide.md"), "utf8"),
  ]);
  return new Response(parts.join("\n\n"), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
