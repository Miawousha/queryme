import { NextResponse, after } from "next/server";
import { getDb } from "@/lib/db/client";
import { getAccountByGithubId } from "@/lib/accounts/repo";
import { verifySignature } from "@/lib/auto-sync/verify";
import { parseDelivery, pushMatchesSource } from "@/lib/github-app/events";
import {
  findAccountIdByInstallation,
  connectInstallation,
  disconnectInstallation,
} from "@/lib/github-app/repo";
import { getAutoSyncConfig, touchLastDelivery } from "@/lib/auto-sync/repo";
import {
  getActivePersonaSourceRowForAccount,
  syncFromGitHubForAccount,
} from "@/lib/persona-source";

export const runtime = "nodejs";

/**
 * The single GitHub App webhook. Authenticated ONLY by the app-level HMAC
 * secret. A verified delivery is routed by `parseDelivery`; installs map by
 * `sender.id → accounts.githubId`, and the install/first-sync + every push run
 * the reused `syncFromGitHubForAccount` against the account's STORED source in
 * `after()` so a slow/failed sync never makes GitHub retry.
 */
export async function POST(req: Request) {
  const secret = process.env.GITHUB_APP_WEBHOOK_SECRET;
  if (!secret) {
    console.error("github app webhook: GITHUB_APP_WEBHOOK_SECRET is not set");
    return NextResponse.json({ error: "webhook not configured" }, { status: 500 });
  }

  const rawBody = await req.text();
  if (!verifySignature(secret, rawBody, req.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let payload: unknown = {};
  try {
    payload = JSON.parse(rawBody);
  } catch {
    // Verified deliveries are JSON; a non-JSON body parses to {} → ignore.
  }

  const delivery = parseDelivery(req.headers.get("x-github-event"), payload);

  const syncInBackground = (accountId: string, repoUrl: string, branch: string) =>
    after(() =>
      syncFromGitHubForAccount(accountId, repoUrl, branch).catch((err) =>
        console.error(`github app: background sync failed for ${accountId}`, err),
      ),
    );

  switch (delivery.kind) {
    case "pong":
      return NextResponse.json({ ok: true, pong: true });

    case "install": {
      const account = await getAccountByGithubId(getDb(), delivery.githubUserId);
      if (!account) {
        console.error("github app: unmatched install for github user", delivery.githubUserId);
        return NextResponse.json({ ok: true, unmatched: true });
      }
      await connectInstallation(account.id, delivery.installationId);
      if (delivery.repos.length === 1) {
        syncInBackground(account.id, `https://github.com/${delivery.repos[0]}`, "main");
      }
      return NextResponse.json({ ok: true, connected: true });
    }

    case "uninstall":
      await disconnectInstallation(delivery.installationId);
      return NextResponse.json({ ok: true, disconnected: true });

    case "repos-added": {
      const accountId = await findAccountIdByInstallation(delivery.installationId);
      if (!accountId) return NextResponse.json({ ok: true, skipped: true });
      const active = await getActivePersonaSourceRowForAccount(accountId);
      if (!active && delivery.repos.length === 1) {
        syncInBackground(accountId, `https://github.com/${delivery.repos[0]}`, "main");
      }
      return NextResponse.json({ ok: true });
    }

    case "push": {
      const accountId = await findAccountIdByInstallation(delivery.installationId);
      if (!accountId) return NextResponse.json({ ok: true, skipped: true });
      const config = await getAutoSyncConfig(accountId);
      if (!config?.enabled) return NextResponse.json({ ok: true, skipped: true });
      const active = await getActivePersonaSourceRowForAccount(accountId);
      if (
        !active ||
        !pushMatchesSource(delivery.repoFullName, delivery.ref, active.repoUrl, active.branch)
      ) {
        return NextResponse.json({ ok: true, skipped: true });
      }
      await touchLastDelivery(accountId);
      syncInBackground(accountId, active.repoUrl, active.branch);
      return NextResponse.json({ ok: true, syncing: true });
    }

    default:
      return NextResponse.json({ ok: true });
  }
}
