import { NextRequest, NextResponse } from "next/server";
import { loadAccountForSlug } from "@/lib/accounts/load";
import { loadCvKb } from "@/lib/cv/load";
import type { KbLang } from "@/lib/kb/loader";

export const runtime = "nodejs";

function parseLang(value: string | null): KbLang {
  return value === "fr" ? "fr" : "en";
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ username: string }> },
): Promise<Response> {
  const lang = parseLang(req.nextUrl.searchParams.get("lang"));
  const { username } = await params;
  const account = await loadAccountForSlug(username);
  if (!account) return NextResponse.json({ error: "account_not_found" }, { status: 404 });
  const result = await loadCvKb(account.id, lang);
  if (!result) return NextResponse.json({ error: "persona_not_configured" }, { status: 503 });
  return NextResponse.json(
    { lang, kb: result.cvKb },
    { headers: { "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=60" } },
  );
}
