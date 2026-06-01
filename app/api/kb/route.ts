import { resolveRootAccountId } from "@/lib/accounts/root";
import { handleKbManifest } from "@/lib/kb/handlers";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  return handleKbManifest(await resolveRootAccountId());
}
