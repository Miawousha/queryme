import { requireAdminAccount } from "@/lib/admin/require-admin";
import { resolveProfileUrl } from "@/lib/cv/profile-url";
import { siteOrigin } from "@/lib/site-url";
import { PageHeader } from "@/components/admin/page-header";
import { SignaturePanel } from "@/components/admin/sections/signature-panel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function SignatureSettingsPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const account = await requireAdminAccount(username);
  const profileUrl = await resolveProfileUrl({ accountId: account.id, username: account.username });

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Email signature"
        description="Add a Queritae badge that links to your profile from your email signature."
      />
      <SignaturePanel profileUrl={profileUrl} origin={siteOrigin()} />
    </>
  );
}
