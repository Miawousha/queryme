import { NextResponse } from "next/server";
import { getCachedKbManifest } from "@/lib/kb/cache";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  try {
    const manifest = await getCachedKbManifest();
    return NextResponse.json({ files: manifest });
  } catch {
    return NextResponse.json({ error: "Failed to load the knowledge base." }, { status: 500 });
  }
}
