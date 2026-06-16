import { requireAdminAccount } from "@/lib/admin/require-admin";
import { ContentTab } from "@/components/admin/content-tab";
import { AutoSyncPanel } from "@/components/admin/auto-sync-panel";
import { appInstallUrl } from "@/lib/github-app/url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ContentSettingsPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const account = await requireAdminAccount(username);
  const apiBasePath = `/api/a/${account.username}/admin`;
  return (
    <>
      <ContentTab
        apiBasePath={apiBasePath}
        username={account.username}
        appInstallUrl={appInstallUrl()}
      />
      <AutoSyncPanel apiBasePath={apiBasePath} />
    </>
  );
}
