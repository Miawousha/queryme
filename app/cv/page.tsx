import type { Metadata } from "next";
import { loadCvKb, cvPersonaName } from "@/lib/cv/load";
import { resolveRootAccountId } from "@/lib/accounts/root";
import { CvStandalone } from "@/components/cv/cv-standalone";
import { NotConfiguredScreen } from "@/components/not-configured-screen";
import type { KbLang } from "@/lib/kb/loader";

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const name = await cvPersonaName(await resolveRootAccountId());
  if (!name) return { title: "CV" };
  return { title: `${name} — CV`, description: `Printable CV for ${name}.` };
}

function parseLang(value: string | string[] | undefined): KbLang {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "fr" ? "fr" : "en";
}

type Props = { searchParams: Promise<{ lang?: string }> };

export default async function CvPage({ searchParams }: Props) {
  const { lang: langParam } = await searchParams;
  const lang = parseLang(langParam);
  const result = await loadCvKb(await resolveRootAccountId(), lang);
  if (!result) return <NotConfiguredScreen />;
  return <CvStandalone cvKb={result.cvKb} lang={lang} basePath="" />;
}
