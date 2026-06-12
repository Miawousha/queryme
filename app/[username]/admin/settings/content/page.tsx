import { requireAdminAccount } from "@/lib/admin/require-admin";
import { ContentTab } from "@/components/admin/content-tab";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ContentSettingsPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const account = await requireAdminAccount(username);
  return (
    <ContentTab
      apiBasePath={`/api/a/${account.username}/admin`}
      username={account.username}
    />
  );
}
