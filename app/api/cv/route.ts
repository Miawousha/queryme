import { NextRequest, NextResponse } from "next/server";
import { loadCvKb } from "@/lib/cv/load";
import { resolveRootAccountId } from "@/lib/accounts/root";
import type { KbLang } from "@/lib/kb/loader";

export const runtime = "nodejs";

function parseLang(value: string | null): KbLang {
  return value === "fr" ? "fr" : "en";
}

export async function GET(req: NextRequest) {
  const lang = parseLang(req.nextUrl.searchParams.get("lang"));
  const result = await loadCvKb(await resolveRootAccountId(), lang);
  if (!result) {
    return NextResponse.json({ error: "persona_not_configured" }, { status: 503 });
  }
  return NextResponse.json(
    { lang, kb: result.cvKb },
    { headers: { "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=60" } },
  );
}
