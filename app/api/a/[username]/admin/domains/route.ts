import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { resolveAccountAdmin } from "@/app/[username]/admin/resolve";
import { addDomainForAccount, listDomainsForAccount, DomainError } from "@/lib/domains/service";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const res = await resolveAccountAdmin(username);
  if (res.kind !== "ok") return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ domains: await listDomainsForAccount(getDb(), res.account.id) });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const res = await resolveAccountAdmin(username);
  if (res.kind !== "ok") return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { hostname?: unknown };
  if (typeof body.hostname !== "string") {
    return NextResponse.json({ error: "hostname is required" }, { status: 400 });
  }
  try {
    const domain = await addDomainForAccount(getDb(), res.account, body.hostname);
    return NextResponse.json({ domain }, { status: 201 });
  } catch (e) {
    if (e instanceof DomainError) {
      return NextResponse.json({ error: e.message, reason: e.reason }, { status: 400 });
    }
    throw e;
  }
}
