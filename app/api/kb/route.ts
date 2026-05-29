import { NextResponse } from "next/server";
import { getCachedKbManifest } from "@/lib/kb/cache";
import { ensurePersonaCacheReady, getActivePersonaRoot } from "@/lib/persona-source";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  await ensurePersonaCacheReady();
  if (!getActivePersonaRoot()) {
    return NextResponse.json({ error: "persona_not_configured" }, { status: 503 });
  }
  try {
    const manifest = await getCachedKbManifest();
    return NextResponse.json({ files: manifest });
  } catch {
    return NextResponse.json({ error: "Failed to load the knowledge base." }, { status: 500 });
  }
}
