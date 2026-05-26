import { describe, it, expect } from "vitest";
import {
  conversationsPerDay,
  topQuestionTopics,
  citationDensityPerConversation,
} from "@/lib/admin/analytics";

describe("conversationsPerDay", () => {
  it("buckets timestamps into UTC date keys", () => {
    const rows = [
      { startedAt: new Date("2026-05-20T10:00:00Z") },
      { startedAt: new Date("2026-05-20T22:30:00Z") },
      { startedAt: new Date("2026-05-21T01:00:00Z") },
    ];
    expect(conversationsPerDay(rows, 3, new Date("2026-05-22T00:00:00Z"))).toEqual([
      { date: "2026-05-20", count: 2 },
      { date: "2026-05-21", count: 1 },
      { date: "2026-05-22", count: 0 },
    ]);
  });
});

describe("topQuestionTopics", () => {
  it("buckets questions by keyword and returns counts descending", () => {
    const rows = [
      { question: "What is his battery management experience?" },
      { question: "Tell me about his battery skills" },
      { question: "How do I contact him?" },
      { question: "What's his most recent role?" },
    ];
    const out = topQuestionTopics(rows);
    expect(out[0]).toEqual({ topic: "battery", count: 2 });
    expect(out.map((t) => t.topic)).toContain("contact");
    expect(out.map((t) => t.topic)).toContain("role");
  });

  it("anchors short tokens on word boundaries — no false positives", () => {
    // 'ai' must not match 'main' or 'chairman'; 'soc' must not match
    // 'society'; 'hire' must not match 'shire'. None of these should bucket.
    const out = topQuestionTopics([
      { question: "What is the main thing about chairman society and shire?" },
    ]);
    expect(out).toEqual([]);
  });

  it("matches the anchored token when present as a whole word", () => {
    const out = topQuestionTopics([{ question: "Does he use AI tools?" }]);
    expect(out).toEqual([{ topic: "ai", count: 1 }]);
  });
});

describe("citationDensityPerConversation", () => {
  it("counts citation tokens per assistant turn averaged across the conversation", () => {
    const conv = {
      id: "c1",
      transcript: [
        { role: "user", text: "q1", at: "" },
        { role: "assistant", text: "a [^kb:profile.yaml]", at: "" },
        { role: "user", text: "q2", at: "" },
        { role: "assistant", text: "b [^kb:profile.yaml] and [^kb:skills.yaml]", at: "" },
      ],
    };
    const r = citationDensityPerConversation(conv);
    // 1 + 2 citations across 2 assistant turns -> 1.5 average
    expect(r).toEqual({ conversationId: "c1", assistantTurns: 2, avgCitations: 1.5 });
  });

  it("returns avgCitations 0 when there are no assistant turns", () => {
    const r = citationDensityPerConversation({ id: "c1", transcript: [] });
    expect(r).toEqual({ conversationId: "c1", assistantTurns: 0, avgCitations: 0 });
  });
});
