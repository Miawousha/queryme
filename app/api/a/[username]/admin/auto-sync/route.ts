import { NextResponse } from "next/server";
import { resolveAccountAdmin } from "@/app/[username]/admin/resolve";
import {
  getAutoSyncConfig,
  enableAutoSync,
  disableAutoSync,
} from "@/lib/auto-sync/repo";
import { appInstallUrl } from "@/lib/github-app/url";
import type { PersonaAutoSync } from "@/lib/db/schema";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ username: string }> };

function view(config: PersonaAutoSync | null) {
  return {
    enabled: config?.enabled ?? false,
    configured: config !== null,
    lastDeliveryAt: config?.lastDeliveryAt ?? null,
    connectedViaApp: Boolean(config?.installationId),
    manageUrl: config?.installationId
      ? `https://github.com/settings/installations/${config.installationId}`
      : null,
    appInstallUrl: appInstallUrl(),
  };
}

export async function GET(_req: Request, { params }: Ctx) {
  const { username } = await params;
  const res = await resolveAccountAdmin(username);
  if (res.kind !== "ok") return NextResponse.json({ error: "Not found" }, { status: 404 });
  const config = await getAutoSyncConfig(res.account.id);
  return NextResponse.json(view(config));
}

export async function POST(req: Request, { params }: Ctx) {
  const { username } = await params;
  const res = await resolveAccountAdmin(username);
  if (res.kind !== "ok") return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: { action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  let config: PersonaAutoSync | null;
  switch (body.action) {
    case "enable":
      config = await enableAutoSync(res.account.id);
      break;
    case "disable":
      config = await disableAutoSync(res.account.id);
      break;
    default:
      return NextResponse.json({ error: "unknown action" }, { status: 400 });
  }
  return NextResponse.json(view(config));
}
