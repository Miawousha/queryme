import { NextResponse, after } from "next/server";
import { loadAccountForSlug } from "@/lib/accounts/load";
import { getAutoSyncConfig, touchLastDelivery } from "@/lib/auto-sync/repo";
import { verifySignature, decideAction } from "@/lib/auto-sync/verify";
import {
  getActivePersonaSourceRowForAccount,
  syncFromGitHubForAccount,
} from "@/lib/persona-source";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ username: string }> };

/**
 * Public GitHub `push` webhook. Authenticated ONLY by the per-account HMAC
 * secret — never a session. A verified, eligible push acks 200 immediately and
 * runs the sync in `after()` so a slow or failing sync never makes GitHub
 * retry; failures are recorded in persona_source history. The repo + branch are
 * always read from the account's STORED active source, never the payload.
 */
export async function POST(req: Request, { params }: Ctx) {
  const { username } = await params;
  const account = await loadAccountForSlug(username);
  if (!account) return NextResponse.json({ error: "not found" }, { status: 404 });

  const config = await getAutoSyncConfig(account.id);
  if (!config) {
    return NextResponse.json({ error: "auto-sync not configured" }, { status: 404 });
  }

  // Read the RAW body for HMAC; verify BEFORE parsing or acting on anything.
  const rawBody = await req.text();
  if (!verifySignature(config.secret, rawBody, req.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let payload: { ref?: unknown } = {};
  try {
    payload = JSON.parse(rawBody);
  } catch {
    // A ping/push always has a JSON body; a non-JSON body simply yields no ref.
  }

  const active = await getActivePersonaSourceRowForAccount(account.id);
  const decision = decideAction({
    event: req.headers.get("x-github-event"),
    ref: typeof payload.ref === "string" ? payload.ref : null,
    enabled: config.enabled,
    branch: active?.branch ?? "",
  });

  if (decision === "pong") return NextResponse.json({ ok: true, pong: true });
  if (decision === "skip" || !active) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  // Eligible push: ack immediately and do the work in after() so neither the
  // delivery stamp nor a slow/failed sync can affect the response GitHub sees.
  // syncFromGitHubForAccount has its own in-flight dedupe + error containment.
  after(async () => {
    await touchLastDelivery(account.id).catch(() => {});
    try {
      await syncFromGitHubForAccount(account.id, active.repoUrl, active.branch);
    } catch (err) {
      // The primitive records its own error rows for fetch/validation failures;
      // this guards the rare promotion-phase throw so it logs gracefully rather
      // than surfacing as an unhandled rejection inside after().
      console.error(`auto-sync: background sync threw for account ${account.id}`, err);
    }
  });
  return NextResponse.json({ ok: true, syncing: true });
}
