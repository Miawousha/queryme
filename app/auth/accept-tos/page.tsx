import type { Route } from "next";
import { redirect } from "next/navigation";
import { requireSessionAccount, needsTosAcceptance } from "@/lib/accounts/guard";
import { safeReturnTo } from "@/lib/auth/return-to";
import { AcceptTosForm } from "@/components/accept-tos-form";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AcceptTosPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const account = await requireSessionAccount();
  if (!account) redirect("/api/auth/github/login" as Route);
  const fallback = `/${account.username}/admin`;
  const returnTo = safeReturnTo((await searchParams).returnTo, fallback);
  // Already accepted (or not an active account that needs to) → don't show the form.
  if (!needsTosAcceptance(account)) redirect(returnTo as Route);

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 px-6 py-12">
      <h1 className="font-display text-xl text-[var(--color-text-primary)]">Before you continue</h1>
      <AcceptTosForm returnTo={returnTo} />
    </main>
  );
}
