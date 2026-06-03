import { getDb } from "@/lib/db/client";
import { loadAdminCounts } from "@/lib/admin/data";
import { requireAdminAccount } from "@/lib/admin/require-admin";
import { GridBackground } from "@/components/grid-background";
import { AdminHeader } from "@/components/admin/admin-header";
import { AdminRail } from "@/components/admin/admin-rail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const account = await requireAdminAccount(username);
  const counts = await loadAdminCounts(getDb(), account.id);
  const adminBasePath = `/${account.username}/admin`;

  return (
    <>
      <GridBackground />
      <div className="relative z-10 flex h-dvh flex-col">
        <AdminHeader username={account.username} />
        <div className="flex min-h-0 flex-1">
          <AdminRail adminBasePath={adminBasePath} counts={counts} />
          <main className="min-h-0 flex-1 overflow-auto px-4 py-6 sm:px-6">{children}</main>
        </div>
      </div>
    </>
  );
}
