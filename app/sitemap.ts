import type { MetadataRoute } from "next";
import { getDb } from "@/lib/db/client";
import { listAllAccounts } from "@/lib/accounts/repo";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://example.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base: MetadataRoute.Sitemap = [
    { url: `${SITE}/`, changeFrequency: "weekly", priority: 1.0 },
    { url: `${SITE}/about`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE}/cv`, changeFrequency: "weekly", priority: 0.9 },
  ];
  try {
    const accounts = await listAllAccounts(getDb());
    const perAccount: MetadataRoute.Sitemap = accounts
      .filter((a) => a.repoLinked && a.status === "active")
      .flatMap((a) => [
        { url: `${SITE}/${a.username}`, changeFrequency: "weekly", priority: 0.7 },
        { url: `${SITE}/${a.username}/cv`, changeFrequency: "weekly", priority: 0.6 },
      ]);
    return [...base, ...perAccount];
  } catch (err) {
    // DB unavailable at build/runtime → static entries only.
    // eslint-disable-next-line no-console
    console.warn("[sitemap] account enumeration failed; serving static entries", err);
    return base;
  }
}
