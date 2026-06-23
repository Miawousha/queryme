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
  profileUrl,
  qrSvg,
}: {
  cvKb: Kb;
  lang: KbLang;
  basePath: string;
  profileUrl?: string;
  qrSvg?: string;
}) {
  const t = CV_STRINGS[lang];
  const q = t.queritae;
  const queritae = {
    strings: {
      pill: q.pill,
      title: q.title,
      pitch: q.pitchTemplate.replace("{name}", cvKb.profile.name),
      bullets: q.bullets,
      exploreCta: q.exploreCta,
      signupCta: q.signupCta,
      close: q.close,
    },
    landingHref: "/?ref=profile",
    signupHref: "/api/auth/github/login",
  };
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <CvTopBar
        lang={lang}
        printLabel={t.print}
        backLabel="queritae"
        basePath={basePath}
        queritae={queritae}
      />
      <CvDocumentView kb={cvKb} lang={lang} profileUrl={profileUrl} qrSvg={qrSvg} />
    </main>
  );
}
