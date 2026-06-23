import { requireAdminAccount } from "@/lib/admin/require-admin";
import { PageHeader } from "@/components/admin/page-header";
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
  return (
    <>
      <PageHeader
        eyebrow="Activity"
        title="Analytics"
        description="Traffic and engagement across your knowledge base."
      />
      <AnalyticsSection apiBasePath={`/api/a/${account.username}/admin`} />
    </>
  );
}
