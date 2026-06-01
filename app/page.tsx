import { getActivePersonaSourceRowForAccount } from "@/lib/persona-source";
import { getPersonaStore } from "@/lib/persona/store";
import { resolveRootAccountId } from "@/lib/accounts/root";
import { loadPersona } from "@/lib/persona";
import { buildUiStrings } from "@/lib/language";
import { HomePageClient } from "@/components/home-page-client";
import { NotConfiguredScreen } from "@/components/not-configured-screen";

export default async function Home() {
  const accountId = await resolveRootAccountId();
  await getPersonaStore().ensureReady(accountId);
  const root = getPersonaStore().getRoot(accountId);
  if (!root) return <NotConfiguredScreen />;
  const persona = loadPersona(root);
  const strings = buildUiStrings(persona);
  const sourceRow = await getActivePersonaSourceRowForAccount(accountId);
  return <HomePageClient strings={strings} contentRepoUrl={sourceRow?.repoUrl ?? null} />;
}
