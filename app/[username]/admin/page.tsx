import { getDb } from "@/lib/db/client";
import { loadConversations } from "@/lib/admin/data";
import { requireAdminAccount } from "@/lib/admin/require-admin";
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
  const conversations = await loadConversations(getDb(), account.id);
  return (
    <ConversationsSection
      conversations={conversations}
      apiBasePath={`/api/a/${account.username}/admin`}
    />
  );
}
