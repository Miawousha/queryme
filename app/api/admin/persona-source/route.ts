import { NextResponse } from "next/server";
import { requireRootAdmin } from "@/lib/accounts/guard";
import { resolveRootAccountId } from "@/lib/accounts/root";
import { personaSourceStatus, personaSourceSync } from "@/lib/admin/persona-source-api";

export const runtime = "nodejs";

export async function GET() {
  if (!(await requireRootAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await personaSourceStatus(await resolveRootAccountId()));
}

export async function POST(req: Request) {
  if (!(await requireRootAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: { repoUrl?: string; branch?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.repoUrl) return NextResponse.json({ error: "repoUrl required" }, { status: 400 });
  const result = await personaSourceSync(await resolveRootAccountId(), body.repoUrl, body.branch);
  if (result.kind === "error") return NextResponse.json({ error: result.message }, { status: 400 });
  return NextResponse.json({ commitSha: result.commitSha, syncedAt: result.syncedAt });
}
