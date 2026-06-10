import type { Metadata } from "next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { loadContent, toResumeKb } from "@/lib/kb/loader";
import { assembleContentText } from "@/lib/kb/assembler";
import "./print.css";

// Persona content is resolved at request time from the active sync, so this
// page must render dynamically — a static prerender at build would bake in the
// "not configured" screen (no persona symlink exists during `next build`).
export const dynamic = "force-dynamic";

import { getPersonaStore } from "@/lib/persona/store";
import { resolveRootAccountId } from "@/lib/accounts/root";
import { loadPersona } from "@/lib/persona";
import { NotConfiguredScreen } from "@/components/not-configured-screen";

export async function generateMetadata(): Promise<Metadata> {
  const accountId = await resolveRootAccountId();
  await getPersonaStore().ensureReady(accountId);
  const root = getPersonaStore().getRoot(accountId);
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
  const accountId = await resolveRootAccountId();
  await getPersonaStore().ensureReady(accountId);
  const root = getPersonaStore().getRoot(accountId);
  if (!root) return <NotConfiguredScreen />;
  const content = await loadContent(root);
  const kb = toResumeKb(content);
  const text = assembleContentText(content);
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
