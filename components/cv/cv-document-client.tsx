"use client";

import { useEffect, useState } from "react";
import type { Kb, KbLang } from "@/lib/kb/loader";
import { CvDocumentView } from "./cv-document";

type CvPayload = { lang: KbLang; kb: Kb };

export function CvDocumentClient({ lang }: { lang: KbLang }) {
  const [data, setData] = useState<CvPayload | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(false);
    fetch(`/api/cv?lang=${lang}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("cv fetch failed"))))
      .then((payload: CvPayload) => {
        if (!cancelled) setData(payload);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [lang]);

  if (error) {
    return <p className="text-xs text-red-500">CV unavailable.</p>;
  }
  if (!data) {
    return <p className="text-xs text-[var(--color-text-tertiary)]">Loading…</p>;
  }
  return <CvDocumentView kb={data.kb} lang={data.lang} />;
}
