import { ensurePersonaCacheReady, getActivePersonaRoot } from "@/lib/persona-source";
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
  return <HomePageClient strings={strings} />;
}
