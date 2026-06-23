import { requireAdminAccount } from "@/lib/admin/require-admin";
import { PageHeader } from "@/components/admin/page-header";
import { ContentTab } from "@/components/admin/content-tab";
import { AutoSyncPanel } from "@/components/admin/auto-sync-panel";
import { appInstallUrl } from "@/lib/github-app/url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ContentSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ app?: string }>;
}) {
  const { username } = await params;
  const { app } = await searchParams;
  const account = await requireAdminAccount(username);
  const apiBasePath = `/api/a/${account.username}/admin`;
  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Content source"
        description="Connect and sync the GitHub repo that powers your knowledge base."
      />
      <ContentTab
        apiBasePath={apiBasePath}
        username={account.username}
        appInstallUrl={appInstallUrl()}
      />
      <AutoSyncPanel apiBasePath={apiBasePath} justInstalled={app === "installed"} />
    </>
  );
}
