import { requireAdminAccount } from "@/lib/admin/require-admin";
import { AnalyticsSection } from "@/components/admin/sections/analytics-section";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AnalyticsPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const account = await requireAdminAccount(username);
  return <AnalyticsSection apiBasePath={`/api/a/${account.username}/admin`} />;
}
