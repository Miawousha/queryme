import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

// Served as one document: agent preamble first, then the full content-repo
// guide verbatim — the same file that documents the schemas the sync
// validates with, so what agents fetch cannot drift from validation.
const DOC_FILES = ["agent-setup-preamble.md", "content-repo-guide.md"];

export async function GET() {
  const parts = await Promise.all(
    DOC_FILES.map((name) =>
      readFile(path.join(process.cwd(), "docs", name), "utf8"),
    ),
  );
  return new Response(parts.join("\n\n"), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
