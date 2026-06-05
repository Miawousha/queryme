import type { Metadata } from "next";
import { loadCvKb, cvPersonaName, parseCvLang } from "@/lib/cv/load";
import { resolveRootAccountId } from "@/lib/accounts/root";
import { CvStandalone } from "@/components/cv/cv-standalone";
import { NotConfiguredScreen } from "@/components/not-configured-screen";

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const name = await cvPersonaName(await resolveRootAccountId());
  if (!name) return { title: "CV" };
  return { title: `${name} — CV`, description: `Printable CV for ${name}.` };
}

type Props = { searchParams: Promise<{ lang?: string }> };

export default async function CvPage({ searchParams }: Props) {
  const { lang: langParam } = await searchParams;
  const lang = parseCvLang(langParam);
  const result = await loadCvKb(await resolveRootAccountId(), lang);
  if (!result) return <NotConfiguredScreen />;
  return <CvStandalone cvKb={result.cvKb} lang={lang} basePath="" />;
}
