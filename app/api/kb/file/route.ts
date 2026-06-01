import { NextRequest } from "next/server";
import { resolveRootAccountId } from "@/lib/accounts/root";
import { handleKbFile } from "@/lib/kb/handlers";

export const runtime = "nodejs";

export async function GET(req: NextRequest): Promise<Response> {
  return handleKbFile(req, await resolveRootAccountId());
}
