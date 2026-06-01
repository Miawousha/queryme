import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AccountList } from "@/components/admin/account-list";
import { loadSuperConsole } from "./load";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Platform admin — queryme",
  robots: { index: false, follow: false },
};

export default async function SuperAdminPage() {
  const result = await loadSuperConsole();
  if (!result) notFound();
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="mb-6 font-display text-xl text-[var(--color-text-primary)]">Accounts</h1>
      <AccountList accounts={result.accounts} />
    </main>
  );
}
