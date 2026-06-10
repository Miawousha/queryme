import { NextRequest, NextResponse } from "next/server";
import { loadActiveAccountForSlug } from "@/lib/accounts/load";
import { loadCvKb, parseCvLang } from "@/lib/cv/load";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ username: string }> },
): Promise<Response> {
  const lang = parseCvLang(req.nextUrl.searchParams.get("lang"));
  const { username } = await params;
  const account = await loadActiveAccountForSlug(username);
  if (!account) return NextResponse.json({ error: "account_not_found" }, { status: 404 });
  const result = await loadCvKb(account.id, lang);
  if (!result) return NextResponse.json({ error: "persona_not_configured" }, { status: 503 });
  return NextResponse.json(
    { lang, kb: result.cvKb },
    { headers: { "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=60" } },
  );
}
