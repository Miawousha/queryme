import { NextRequest } from "next/server";
import { resendTransport } from "@/lib/notify/email";
import { handleForward } from "./handler";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  return handleForward(req, {
    transport: resendTransport(),
    notifyTo: process.env.FORWARD_NOTIFICATION_TO ?? "",
    notifyFrom: process.env.FORWARD_NOTIFICATION_FROM ?? "queryme@localhost",
  });
}
