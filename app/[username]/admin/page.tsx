import { redirect } from "next/navigation";
import type { Route } from "next";
import { getDb } from "@/lib/db/client";
import { loadConversations } from "@/lib/admin/data";
import { requireAdminAccount } from "@/lib/admin/require-admin";
import { needsContentOnboarding } from "@/lib/admin/onboarding";
import { getActivePersonaSourceRowForAccount } from "@/lib/persona-source";
import { PageHeader } from "@/components/admin/page-header";
import { ConversationsSection } from "@/components/admin/sections/conversations-section";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ConversationsPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const account = await requireAdminAccount(username);

  // Steer accounts with no live content to the setup page rather than the empty
  // Conversations view. Fires on every entry to the index (signup, direct nav,
  // returning sessions) until a source syncs successfully; the content page
  // itself never redirects, so there's no loop.
  const activeSource = await getActivePersonaSourceRowForAccount(account.id);
  if (needsContentOnboarding(activeSource)) {
    redirect(`/${account.username}/admin/settings/content` as Route);
  }

  const conversations = await loadConversations(getDb(), account.id);
  return (
    <>
      <PageHeader
        eyebrow="Activity"
        title="Conversations"
        description="Every chat your knowledge base has answered."
      />
      <ConversationsSection
        conversations={conversations}
        apiBasePath={`/api/a/${account.username}/admin`}
      />
    </>
  );
}
