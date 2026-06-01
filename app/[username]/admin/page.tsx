import { notFound, redirect } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { loadAdminData } from "@/lib/admin/data";
import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { resolveAccountAdmin } from "./resolve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AccountAdminPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const res = await resolveAccountAdmin(username);
  if (res.kind === "not-found") notFound();
  if (res.kind === "login") redirect("/api/auth/github/login");

  const data = await loadAdminData(getDb(), res.account.id);
  return <AdminDashboard data={data} apiBasePath={`/api/a/${res.account.username}/admin`} />;
}
