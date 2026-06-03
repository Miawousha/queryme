import { getDb } from "@/lib/db/client";
import { loadQuestions } from "@/lib/admin/data";
import { requireAdminAccount } from "@/lib/admin/require-admin";
import { QuestionsSection } from "@/components/admin/sections/questions-section";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function QuestionsPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const account = await requireAdminAccount(username);
  const questions = await loadQuestions(getDb(), account.id);
  const adminBasePath = `/${account.username}/admin`;
  return (
    <QuestionsSection
      questions={questions}
      apiBasePath={`/api/a/${account.username}/admin`}
      adminBasePath={adminBasePath}
    />
  );
}
