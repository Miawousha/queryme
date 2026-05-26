import { describe, it, expect } from "vitest";
import { forwardQuestion, recordReply } from "@/lib/questions/repo";

type Row = {
  id: string;
  conversationId: string | null;
  question: string;
  contact: string | null;
  reply: string | null;
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
                reply: null,
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

describe("recordReply", () => {
  function makeDb() {
    const rows = [{ id: "q1", question: "q", reply: null as string | null, answeredAt: null as Date | null, contact: null as string | null, conversationId: null as string | null, createdAt: new Date() }];
    return {
      rows,
      update() {
        return {
          set(v: { reply: string; answeredAt: Date }) {
            return {
              where() {
                return {
                  async returning() {
                    rows[0].reply = v.reply;
                    rows[0].answeredAt = v.answeredAt;
                    return [rows[0]];
                  },
                };
              },
            };
          },
        };
      },
    };
  }

  it("persists reply text and stamps answered_at", async () => {
    const db = makeDb();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await recordReply(db as any, "q1", "Thanks for asking — here's the answer.");
    expect(r.reply).toBe("Thanks for asking — here's the answer.");
    expect(r.answeredAt).toBeInstanceOf(Date);
  });
});
