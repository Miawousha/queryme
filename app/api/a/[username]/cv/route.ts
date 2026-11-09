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
  // No CDN caching: a content sync does not purge Vercel's edge cache, so an
  // s-maxage here kept serving the pre-sync CV in the modal for up to an hour.
  // The loader reads the per-account content cache, like the KB manifest route.
  return NextResponse.json(
    { lang, kb: result.cvKb },
    { headers: { "Cache-Control": "no-store" } },
  );
}
