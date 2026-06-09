import type { Kb, KbLang } from "@/lib/kb/loader";
import { CV_STRINGS } from "@/lib/cv/strings";
import { CvDocumentView } from "./cv-document";
import { CvTopBar } from "./cv-top-bar";
import "./print.css";

/**
 * Standalone printable CV page body, shared by the root `/cv` route and the
 * per-account `/{username}/cv` route. `basePath` is "" for the root account
 * (links resolve to `/cv`) or `/{username}` for a per-account CV.
 */
export function CvStandalone({
  cvKb,
  lang,
  basePath,
}: {
  cvKb: Kb;
  lang: KbLang;
  basePath: string;
}) {
  const t = CV_STRINGS[lang];
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <CvTopBar lang={lang} printLabel={t.print} backLabel="queritae" basePath={basePath} />
      <CvDocumentView kb={cvKb} lang={lang} />
    </main>
  );
}
