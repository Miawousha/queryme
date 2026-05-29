import { describe, it, expect } from "vitest";
import { buildAdminData } from "@/lib/admin/data";
import type { Conversation, ForwardedQuestion } from "@/lib/db/schema";

function conv(overrides: Partial<Conversation>): Conversation {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    channel: "chat",
    language: null,
    transcript: [],
    interviewer: null,
    startedAt: new Date(0),
    lastMessageAt: new Date(0),
    ...overrides,
  };
}

describe("buildAdminData", () => {
  it("counts identified conversations and collects them into interviewers", () => {
    const convs: Conversation[] = [
      conv({ id: "a", channel: "chat" }),
      conv({
        id: "b",
        channel: "mcp",
        interviewer: { name: "Sarah", basis: "stated", updatedAt: "2026-05-22T00:00:00.000Z" },
      }),
      conv({ id: "c", channel: "chat" }),
    ];
    const questions: ForwardedQuestion[] = [];

    const data = buildAdminData(convs, questions);

    expect(data.stats.conversations).toBe(3);
    expect(data.stats.chat).toBe(2);
    expect(data.stats.mcp).toBe(1);
    expect(data.stats.identified).toBe(1);
    expect(data.interviewers.map((c) => c.id)).toEqual(["b"]);
  });

  it("reports zero identified when no conversation has an interviewer", () => {
    const data = buildAdminData([conv({ id: "a" })], []);
    expect(data.stats.identified).toBe(0);
    expect(data.interviewers).toEqual([]);
  });
});
