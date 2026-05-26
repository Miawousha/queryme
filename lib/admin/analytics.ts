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

const TOPIC_KEYWORDS: { topic: string; words: string[] }[] = [
  { topic: "battery", words: ["battery", "bms", "soc", "soh", "balancing"] },
  { topic: "contact", words: ["contact", "email", "reach", "linkedin"] },
  { topic: "role", words: ["role", "recent", "current", "title", "position"] },
  { topic: "ai", words: ["ai", "llm", "agent", "anthropic", "claude"] },
  { topic: "leadership", words: ["cto", "founder", "team", "manage", "hire"] },
];

export function topQuestionTopics(
  rows: { question: string }[],
): { topic: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const lower = r.question.toLowerCase();
    for (const t of TOPIC_KEYWORDS) {
      if (t.words.some((w) => lower.includes(w))) {
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
