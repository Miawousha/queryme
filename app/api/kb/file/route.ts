import { promises as fs } from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { getCachedKbManifest } from "@/lib/kb/cache";
import type { KbFileType } from "@/lib/kb/file-type";

export const runtime = "nodejs";

const KB_DIR = path.resolve(process.cwd(), "kb");

const CONTENT_TYPE: Record<KbFileType, string> = {
  md: "text/plain; charset=utf-8",
  yaml: "text/plain; charset=utf-8",
  html: "text/html; charset=utf-8",
  pdf: "application/pdf",
};

export async function GET(req: NextRequest): Promise<Response> {
  const requested = new URL(req.url).searchParams.get("path");
  if (!requested) {
    return NextResponse.json({ error: "A `path` query parameter is required." }, { status: 400 });
  }

  // Whitelist: the path must be an exact manifest entry. Anything else —
  // including traversal attempts — is rejected before touching the filesystem.
  const manifest = await getCachedKbManifest();
  const entry = manifest.find((f) => f.path === requested);
  if (!entry) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  try {
    const buffer = await fs.readFile(path.join(KB_DIR, entry.path));
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "content-type": CONTENT_TYPE[entry.type],
        "cache-control": "public, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to read the file." }, { status: 500 });
  }
}
