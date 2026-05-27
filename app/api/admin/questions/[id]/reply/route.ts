import { NextRequest } from "next/server";
import { resendTransport } from "@/lib/notify/email";
import { handleReply } from "./handler";

export const runtime = "nodejs";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handleReply(req, ctx, {
    transport: resendTransport(),
    from: process.env.FORWARD_NOTIFICATION_FROM ?? "queryme@localhost",
  });
}
