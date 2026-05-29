import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { loadKb, type KbLang } from "@/lib/kb/loader";
import { filterKbForCv, loadCvConfig } from "@/lib/kb/cv-config";
import { ensurePersonaCacheReady, getActivePersonaRoot } from "@/lib/persona-source";

export const runtime = "nodejs";

function parseLang(value: string | null): KbLang {
  return value === "fr" ? "fr" : "en";
}

export async function GET(req: NextRequest) {
  const lang = parseLang(req.nextUrl.searchParams.get("lang"));
  await ensurePersonaCacheReady();
  const root = getActivePersonaRoot();
  if (!root) {
    return NextResponse.json({ error: "persona_not_configured" }, { status: 503 });
  }
  const [kb, config] = await Promise.all([
    loadKb(path.join(root, "kb"), lang),
    loadCvConfig(root),
  ]);
  const cvKb = filterKbForCv(kb, config);
  // Cache for an hour at the edge — same TTL as `/cv` page revalidate.
  return NextResponse.json(
    { lang, kb: cvKb },
    { headers: { "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=60" } },
  );
}
