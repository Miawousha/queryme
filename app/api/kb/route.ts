import { NextResponse } from "next/server";
import { getCachedKbManifest } from "@/lib/kb/cache";
import { getPersonaStore } from "@/lib/persona/store";
import { resolveRootAccountId } from "@/lib/accounts/root";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const accountId = await resolveRootAccountId();
  await getPersonaStore().ensureReady(accountId);
  const root = getPersonaStore().getRoot(accountId);
  if (!root) {
    return NextResponse.json({ error: "persona_not_configured" }, { status: 503 });
  }
  try {
    const manifest = await getCachedKbManifest(accountId);
    return NextResponse.json({ files: manifest });
  } catch {
    return NextResponse.json({ error: "Failed to load the knowledge base." }, { status: 500 });
  }
}
