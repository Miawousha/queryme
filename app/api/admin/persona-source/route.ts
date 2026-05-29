import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin/auth";
import {
  getActivePersonaSourceRow,
  listSyncHistory,
  syncFromGitHub,
} from "@/lib/persona-source";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const [active, history] = await Promise.all([
    getActivePersonaSourceRow(),
    listSyncHistory(10),
  ]);
  return NextResponse.json({ active, history });
}

export async function POST(req: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: { repoUrl?: string; branch?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.repoUrl) {
    return NextResponse.json({ error: "repoUrl required" }, { status: 400 });
  }
  const result = await syncFromGitHub(body.repoUrl, body.branch);
  if (result.kind === "error") {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }
  return NextResponse.json({
    commitSha: result.commitSha,
    syncedAt: result.syncedAt,
  });
}
