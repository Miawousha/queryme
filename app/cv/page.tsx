import type { Metadata } from "next";
import path from "node:path";
import { loadKb, type KbLang } from "@/lib/kb/loader";
import { filterKbForCv, loadCvConfig } from "@/lib/kb/cv-config";
import { CvDocumentView } from "@/components/cv/cv-document";
import { CvTopBar } from "./cv-top-bar";
import { CV_STRINGS } from "@/lib/cv/strings";
import "./print.css";

export const revalidate = 3600;

import { ensurePersonaCacheReady, getActivePersonaRoot } from "@/lib/persona-source";
import { loadPersona } from "@/lib/persona";
import { NotConfiguredScreen } from "@/components/not-configured-screen";

export async function generateMetadata(): Promise<Metadata> {
  await ensurePersonaCacheReady();
  const root = getActivePersonaRoot();
  if (!root) return { title: "CV" };
  const persona = loadPersona(root);
  return {
    title: `${persona.fullName} — CV`,
    description: `Printable CV for ${persona.fullName}.`,
  };
}

function parseLang(value: string | string[] | undefined): KbLang {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "fr" ? "fr" : "en";
}

type Props = { searchParams: Promise<{ lang?: string }> };

export default async function CvPage({ searchParams }: Props) {
  const params = await searchParams;
  const lang = parseLang(params.lang);
  const t = CV_STRINGS[lang];
  await ensurePersonaCacheReady();
  const root = getActivePersonaRoot();
  if (!root) return <NotConfiguredScreen />;
  const [kb, config] = await Promise.all([
    loadKb(path.join(root, "kb"), lang),
    loadCvConfig(root),
  ]);
  const cvKb = filterKbForCv(kb, config);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <CvTopBar lang={lang} printLabel={t.print} backLabel="queryme" />
      <CvDocumentView kb={cvKb} lang={lang} />
    </main>
  );
}
