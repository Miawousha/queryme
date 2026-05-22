import path from "node:path";
import { NextResponse } from "next/server";
import { loadKbManifest, type KbFile } from "@/lib/kb/manifest";

export const runtime = "nodejs";

const KB_DIR = path.resolve(process.cwd(), "kb");

// The KB is immutable for the process lifetime — load the manifest once.
let cached: KbFile[] | null = null;

async function getManifest(): Promise<KbFile[]> {
  if (cached) return cached;
  cached = await loadKbManifest(KB_DIR);
  return cached;
}

export async function GET(): Promise<Response> {
  try {
    const manifest = await getManifest();
    return NextResponse.json({ files: manifest });
  } catch {
    return NextResponse.json({ error: "Failed to load the knowledge base." }, { status: 500 });
  }
}
