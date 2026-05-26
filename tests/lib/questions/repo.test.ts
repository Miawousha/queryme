import { describe, it, expect } from "vitest";
import { forwardQuestion } from "@/lib/questions/repo";

type Row = {
  id: string;
  conversationId: string | null;
  question: string;
  contact: string | null;
  answeredAt: Date | null;
  createdAt: Date;
};

function makeDb() {
  const rows: Row[] = [];
  return {
    rows,
    insert() {
      return {
        values(v: { question: string; conversationId?: string; contact?: string | null }) {
          return {
            async returning(): Promise<Row[]> {
              const row: Row = {
                id: `id-${rows.length + 1}`,
                conversationId: v.conversationId ?? null,
                question: v.question,
                contact: v.contact ?? null,
                answeredAt: null,
                createdAt: new Date(),
              };
              rows.push(row);
              return [row];
            },
          };
        },
      };
    },
  };
}

describe("forwardQuestion", () => {
  it("persists the optional contact field when given", async () => {
    const db = makeDb();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await forwardQuestion(db as any, {
      question: "q",
      conversationId: "00000000-0000-0000-0000-000000000001",
      contact: "sarah@acme.example",
    });
    expect(row.contact).toBe("sarah@acme.example");
  });

  it("persists null contact when omitted", async () => {
    const db = makeDb();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await forwardQuestion(db as any, { question: "q" });
    expect(row.contact).toBeNull();
  });
});
