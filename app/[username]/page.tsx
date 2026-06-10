import { notFound } from "next/navigation";
import { getPersonaStore } from "@/lib/persona/store";
import { loadPersona } from "@/lib/persona";
import { buildUiStrings } from "@/lib/language";
import { HomePageClient } from "@/components/home-page-client";
import { NotConfiguredScreen } from "@/components/not-configured-screen";
import { getActivePersonaSourceRowForAccount } from "@/lib/persona-source";
import { loadActiveAccountForSlug } from "@/lib/accounts/load";

export default async function AccountHome({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const account = await loadActiveAccountForSlug(username);
  if (!account) notFound();

  const store = getPersonaStore();
  await store.ensureReady(account.id);
  const root = store.getRoot(account.id);
  if (!root) return <NotConfiguredScreen />;

  const persona = loadPersona(root);
  const strings = buildUiStrings(persona);
  const sourceRow = await getActivePersonaSourceRowForAccount(account.id);
  return (
    <HomePageClient
      strings={strings}
      contentRepoUrl={sourceRow?.repoUrl ?? null}
      apiBasePath={`/api/a/${account.username}`}
      cvPrintBase={`/${account.username}`}
      isRootAccount={false}
    />
  );
}
