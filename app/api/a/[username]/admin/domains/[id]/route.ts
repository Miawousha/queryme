import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { resolveAccountAdmin } from "@/app/[username]/admin/resolve";
import { removeDomainForAccount, DomainError } from "@/lib/domains/service";

export const runtime = "nodejs";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ username: string; id: string }> },
) {
  const { username, id } = await params;
  const res = await resolveAccountAdmin(username);
  if (res.kind !== "ok") return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    await removeDomainForAccount(getDb(), res.account, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof DomainError) return NextResponse.json({ error: e.message }, { status: 404 });
    throw e;
  }
}
