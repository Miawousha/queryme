import type { Metadata } from "next";
import path from "node:path";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { loadKb } from "@/lib/kb/loader";
import { assemblePublicKbText } from "@/lib/kb/assembler";
import "./print.css";

export const dynamic = "force-static";
export const revalidate = 3600;

import { ensurePersonaCacheReady, getActivePersonaRoot } from "@/lib/persona-source";
import { loadPersona } from "@/lib/persona";

export async function generateMetadata(): Promise<Metadata> {
  await ensurePersonaCacheReady();
  const root = getActivePersonaRoot();
  if (!root) return { title: "About" };
  const persona = loadPersona(root);
  return {
    title: `${persona.fullName} — CV`,
    description:
      "Battery systems and software engineer. Co-founder, CTO, builder — from silicon to cloud.",
    openGraph: {
      title: `${persona.fullName} — CV`,
      description: "Battery systems and software engineer.",
      type: "profile",
    },
  };
}

export default async function About() {
  const kb = await loadKb(path.join(process.cwd(), "kb"));
  const text = assemblePublicKbText(kb);
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <article className="prose prose-neutral dark:prose-invert">
        <h1>{kb.profile.name}</h1>
        <p className="text-lg text-[var(--color-text-secondary)]">{kb.profile.headline}</p>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
      </article>
    </main>
  );
}
