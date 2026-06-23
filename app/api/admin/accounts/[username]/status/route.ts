import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { requireSuperAdmin, needsTosAcceptance } from "@/lib/accounts/guard";
import { getAccountBySlug, setAccountStatus } from "@/lib/accounts/repo";
import { ACCOUNT_STATUSES } from "@/lib/db/schema";

export const runtime = "nodejs";

const Body = z.object({ status: z.enum(ACCOUNT_STATUSES) });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ username: string }> },
) {
  const su = await requireSuperAdmin();
  if (!su) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (needsTosAcceptance(su)) {
    return NextResponse.json({ error: "Terms acceptance required" }, { status: 403 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { username } = await params;
  // Kill-switching the house account from the console is an operator footgun;
  // the CLI remains the deliberate path for that.
  if (username === process.env.ROOT_ACCOUNT_USERNAME && parsed.data.status !== "active") {
    return NextResponse.json({ error: "The root account must stay active" }, { status: 400 });
  }

  const db = getDb();
  const existing = await getAccountBySlug(db, username);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await setAccountStatus(db, username, parsed.data.status);
  return NextResponse.json({
    ok: true,
    account: {
      id: updated.id,
      username: updated.username,
      githubId: updated.githubId,
      role: updated.role,
      status: updated.status,
      createdAt: updated.createdAt,
    },
  });
}
