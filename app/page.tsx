import { ensurePersonaCacheReady, getActivePersonaRoot, getActivePersonaSourceRow } from "@/lib/persona-source";
import { loadPersona } from "@/lib/persona";
import { buildUiStrings } from "@/lib/language";
import { HomePageClient } from "@/components/home-page-client";
import { NotConfiguredScreen } from "@/components/not-configured-screen";

export default async function Home() {
  await ensurePersonaCacheReady();
  const root = getActivePersonaRoot();
  if (!root) return <NotConfiguredScreen />;
  const persona = loadPersona(root);
  const strings = buildUiStrings(persona);
  const sourceRow = await getActivePersonaSourceRow();
  return <HomePageClient strings={strings} contentRepoUrl={sourceRow?.repoUrl ?? null} />;
}
