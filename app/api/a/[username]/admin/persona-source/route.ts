import { NextResponse } from "next/server";
import { resolveAccountAdmin } from "@/app/[username]/admin/resolve";
import { personaSourceStatus, personaSourceSync } from "@/lib/admin/persona-source-api";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ username: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { username } = await params;
  const res = await resolveAccountAdmin(username);
  if (res.kind !== "ok") return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(await personaSourceStatus(res.account.id));
}

export async function POST(req: Request, { params }: Ctx) {
  const { username } = await params;
  const res = await resolveAccountAdmin(username);
  if (res.kind !== "ok") return NextResponse.json({ error: "Not found" }, { status: 404 });
  let body: { repoUrl?: string; branch?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.repoUrl) return NextResponse.json({ error: "repoUrl required" }, { status: 400 });
  const result = await personaSourceSync(res.account.id, body.repoUrl, body.branch);
  if (result.kind === "error") return NextResponse.json({ error: result.message }, { status: 400 });
  return NextResponse.json({ commitSha: result.commitSha, syncedAt: result.syncedAt });
}
