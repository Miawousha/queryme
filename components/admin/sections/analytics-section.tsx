"use client";

import { useEffect, useState } from "react";
import { LABEL } from "@/components/admin/ui";

type AnalyticsData = {
  perDay: { date: string; count: number }[];
  topics: { topic: string; count: number }[];
  density: { conversationId: string; assistantTurns: number; avgCitations: number }[];
};

export function AnalyticsSection({ apiBasePath }: { apiBasePath: string }) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch(`${apiBasePath}/analytics`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [apiBasePath]);
  if (error) return <p className="text-xs text-red-400">{error}</p>;
  if (!data)
    return (
      <p className="font-mono text-2xs uppercase text-[var(--color-text-tertiary)]">Loading…</p>
    );

  const maxDay = Math.max(1, ...data.perDay.map((d) => d.count));
  const maxTopic = Math.max(1, ...data.topics.map((t) => t.count));

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-2">
        <span className={LABEL}>Conversations per day (last 30)</span>
        <svg viewBox="0 0 300 60" preserveAspectRatio="none" className="h-16 w-full">
          {data.perDay.map((d, i) => {
            const x = (i / Math.max(1, data.perDay.length - 1)) * 300;
            const h = (d.count / maxDay) * 56;
            return (
              <rect key={d.date} x={x - 3} y={60 - h} width={6} height={h} fill="var(--color-accent)" opacity={0.85} />
            );
          })}
        </svg>
      </section>

      <section className="flex flex-col gap-2">
        <span className={LABEL}>Top forwarded-question topics</span>
        <div className="flex flex-col gap-1">
          {data.topics.length === 0 && (
            <p className="text-xs text-[var(--color-text-tertiary)]">No data yet.</p>
          )}
          {data.topics.map((t) => (
            <div key={t.topic} className="flex items-center gap-3">
              <span className="w-24 font-mono text-2xs uppercase text-[var(--color-text-secondary)]">
                {t.topic}
              </span>
              <div className="h-2 flex-1 rounded bg-[var(--color-border)]">
                <div className="h-2 rounded bg-[var(--color-primary)]" style={{ width: `${(t.count / maxTopic) * 100}%` }} />
              </div>
              <span className="w-8 text-right font-mono text-2xs text-[var(--color-text-tertiary)]">
                {t.count}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <span className={LABEL}>Citation density per conversation</span>
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-left font-mono text-2xs uppercase text-[var(--color-text-tertiary)]">
              <th className="py-1.5 pr-3">Conversation</th>
              <th className="py-1.5 pr-3">Assistant turns</th>
              <th className="py-1.5">Avg citations</th>
            </tr>
          </thead>
          <tbody>
            {data.density.map((d) => (
              <tr key={d.conversationId} className="border-b border-[var(--color-border)]/40">
                <td className="py-1.5 pr-3 font-mono text-2xs text-[var(--color-text-secondary)]">
                  {d.conversationId.slice(0, 8)}
                </td>
                <td className="py-1.5 pr-3">{d.assistantTurns}</td>
                <td className="py-1.5">{d.avgCitations.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
