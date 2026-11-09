import type { Route } from "next";
import { redirect } from "next/navigation";
import { requireSessionAccount, needsTosAcceptance } from "@/lib/accounts/guard";
import { safeReturnTo } from "@/lib/auth/return-to";
import { AcceptTosForm } from "@/components/accept-tos-form";
import { AuthFrame } from "@/components/page-frame";

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
    <AuthFrame
      label="Account"
      note="terms"
      eyebrow="One last step"
      title="Before you continue"
      lead={<p>Your account is ready. Review the terms that govern it, then head to your admin.</p>}
    >
      <AcceptTosForm returnTo={returnTo} />
    </AuthFrame>
  );
}
