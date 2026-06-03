import { requireAdminAccount } from "@/lib/admin/require-admin";
import { DomainsPanel } from "@/components/admin/domains-panel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function DomainsSettingsPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const account = await requireAdminAccount(username);
  return <DomainsPanel apiBasePath={`/api/a/${account.username}/admin`} />;
}
