import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadCvKb, cvPersonaName, parseCvLang } from "@/lib/cv/load";
import { loadActiveAccountForSlug } from "@/lib/accounts/load";
import { CvStandalone } from "@/components/cv/cv-standalone";
import { NotConfiguredScreen } from "@/components/not-configured-screen";
import { resolveProfileUrl } from "@/lib/cv/profile-url";
import { qrSvg } from "@/lib/cv/qr";

export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  const account = await loadActiveAccountForSlug(username);
  if (!account) return { title: "CV" };
  const name = await cvPersonaName(account.id);
  if (!name) return { title: "CV" };
  return { title: `${name} — CV`, description: `Printable CV for ${name}.` };
}

type Props = {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ lang?: string }>;
};

export default async function AccountCvPage({ params, searchParams }: Props) {
  const { username } = await params;
  const account = await loadActiveAccountForSlug(username);
  if (!account) notFound();
  const { lang: langParam } = await searchParams;
  const lang = parseCvLang(langParam);
  const result = await loadCvKb(account.id, lang);
  if (!result) return <NotConfiguredScreen />;
  const profileUrl = await resolveProfileUrl({ accountId: account.id, username: account.username });
  const qr = await qrSvg(profileUrl);
  return (
    <CvStandalone
      cvKb={result.cvKb}
      lang={lang}
      basePath={`/${account.username}`}
      profileUrl={profileUrl}
      qrSvg={qr ?? undefined}
    />
  );
}
