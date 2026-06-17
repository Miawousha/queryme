import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { resolveAccountAdmin } from "@/app/[username]/admin/resolve";
import { loadConversationTranscript } from "@/lib/admin/data";

export const runtime = "nodejs";

/** On-demand transcript for a single conversation; the list payload omits it. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ username: string; id: string }> },
) {
  const { username, id } = await params;
  const res = await resolveAccountAdmin(username);
  if (res.kind !== "ok") return NextResponse.json({ error: "Not found" }, { status: 404 });

  const transcript = await loadConversationTranscript(getDb(), res.account.id, id);
  if (transcript === null) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ transcript });
}
