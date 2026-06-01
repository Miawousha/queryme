import type { Metadata } from "next";
import { requireRootAdmin } from "@/lib/accounts/guard";
import { loadAdminData } from "@/lib/admin/data";
import { getDb } from "@/lib/db/client";
import { AdminLogin } from "@/components/admin/admin-login";
import { AdminDashboard } from "@/components/admin/admin-dashboard";

export const runtime = "nodejs";
// Always re-check the session cookie and re-read the database.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin — queryme",
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  if (!(await requireRootAdmin())) {
    return <AdminLogin />;
  }

  const data = await loadAdminData(getDb());
  return <AdminDashboard data={data} />;
}
