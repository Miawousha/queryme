import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { resolveAccountAdmin } from "@/app/[username]/admin/resolve";
import { getDomainById } from "@/lib/domains/repo";
import { refreshStatus } from "@/lib/domains/service";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ username: string; id: string }> },
) {
  const { username, id } = await params;
  const res = await resolveAccountAdmin(username);
  if (res.kind !== "ok") return NextResponse.json({ error: "Not found" }, { status: 404 });

  const db = getDb();
  const row = await getDomainById(db, id);
  if (!row || row.accountId !== res.account.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const domain = await refreshStatus(db, row, res.account.username);
  return NextResponse.json({ domain });
}
