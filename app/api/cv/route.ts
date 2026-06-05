import { NextRequest, NextResponse } from "next/server";
import { loadCvKb, parseCvLang } from "@/lib/cv/load";
import { resolveRootAccountId } from "@/lib/accounts/root";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const lang = parseCvLang(req.nextUrl.searchParams.get("lang"));
  const result = await loadCvKb(await resolveRootAccountId(), lang);
  if (!result) {
    return NextResponse.json({ error: "persona_not_configured" }, { status: 503 });
  }
  return NextResponse.json(
    { lang, kb: result.cvKb },
    { headers: { "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=60" } },
  );
}
