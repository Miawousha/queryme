import { parseCitations } from "@/lib/kb/citations";

export type DayCount = { date: string; count: number };

export function conversationsPerDay(
  rows: { startedAt: Date }[],
  days: number,
  now: Date,
): DayCount[] {
  const buckets = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    buckets.set(d.toISOString().slice(0, 10), 0);
  }
  for (const r of rows) {
    const key = new Date(r.startedAt).toISOString().slice(0, 10);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return [...buckets.entries()].map(([date, count]) => ({ date, count }));
}

/**
 * v1 keyword classifier. English-only. Short tokens like "ai" and "soc" are
 * anchored on word boundaries to avoid matching "main", "chairman",
 * "society", etc. as false positives. If French question volume grows enough
 * to matter, add stems here (e.g. "contacter", "poste", "batterie").
 */
const TOPIC_KEYWORDS: { topic: string; words: string[] }[] = [
  { topic: "battery", words: ["battery", "bms", "soc", "soh", "balancing"] },
  { topic: "contact", words: ["contact", "email", "reach", "linkedin"] },
  { topic: "role", words: ["role", "recent", "current", "title", "position"] },
  { topic: "ai", words: ["ai", "llm", "agent", "anthropic", "claude"] },
  { topic: "leadership", words: ["cto", "founder", "team", "manage", "hire"] },
];

const TOPIC_PATTERNS: { topic: string; re: RegExp }[] = TOPIC_KEYWORDS.map(
  (t) => ({
    topic: t.topic,
    re: new RegExp(`\\b(?:${t.words.join("|")})\\b`, "i"),
  }),
);

export function topQuestionTopics(
  rows: { question: string }[],
): { topic: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    for (const t of TOPIC_PATTERNS) {
      if (t.re.test(r.question)) {
        counts.set(t.topic, (counts.get(t.topic) ?? 0) + 1);
      }
    }
  }
  return [...counts.entries()]
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count);
}

export type CitationDensity = {
  conversationId: string;
  assistantTurns: number;
  avgCitations: number;
};

export function citationDensityPerConversation(conv: {
  id: string;
  transcript: { role: string; text: string; at: string }[];
}): CitationDensity {
  const assistant = conv.transcript.filter((t) => t.role === "assistant");
  if (assistant.length === 0) {
    return { conversationId: conv.id, assistantTurns: 0, avgCitations: 0 };
  }
  const total = assistant.reduce((acc, t) => acc + parseCitations(t.text).length, 0);
  return {
    conversationId: conv.id,
    assistantTurns: assistant.length,
    avgCitations: total / assistant.length,
  };
}
