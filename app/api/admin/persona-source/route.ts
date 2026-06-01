import { NextResponse } from "next/server";
import { requireRootAdmin } from "@/lib/accounts/guard";
import {
  getActivePersonaSourceRowForAccount,
  listSyncHistoryForAccount,
  syncFromGitHubForAccount,
} from "@/lib/persona-source";
import { resolveRootAccountId } from "@/lib/accounts/root";

export async function GET() {
  if (!(await requireRootAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const accountId = await resolveRootAccountId();
  const [active, history] = await Promise.all([
    getActivePersonaSourceRowForAccount(accountId),
    listSyncHistoryForAccount(accountId, 10),
  ]);
  return NextResponse.json({ active, history });
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
  if (!body.repoUrl) {
    return NextResponse.json({ error: "repoUrl required" }, { status: 400 });
  }
  const accountId = await resolveRootAccountId();
  const result = await syncFromGitHubForAccount(accountId, body.repoUrl, body.branch);
  if (result.kind === "error") {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }
  return NextResponse.json({
    commitSha: result.commitSha,
    syncedAt: result.syncedAt,
  });
}
