import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { resolveAccountAdmin } from "@/app/[username]/admin/resolve";
import { getAnalytics } from "@/lib/admin/analytics-api";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const res = await resolveAccountAdmin(username);
  if (res.kind !== "ok") return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(await getAnalytics(getDb(), res.account.id));
}
