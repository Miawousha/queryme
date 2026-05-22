import { describe, it, expect } from "vitest";
import { buildIdentifyTools } from "@/lib/interviewer/tool";
import type { InterviewerIdentity } from "@/lib/db/schema";

const execOpts = { toolCallId: "t1", messages: [] } as never;

describe("identify_interviewer tool", () => {
  it("persists the identity with a server-stamped updatedAt", async () => {
    const saved: InterviewerIdentity[] = [];
    const tools = buildIdentifyTools(async (id) => {
      saved.push(id);
    });
    const before = Date.now();

    const result = await tools.identify_interviewer.execute!(
      { name: "Sarah", company: "Acme", hiringFor: "a CTO", basis: "stated" },
      execOpts,
    );

    expect(result).toEqual({ ok: true });
    expect(saved).toHaveLength(1);
    expect(saved[0].name).toBe("Sarah");
    expect(saved[0].company).toBe("Acme");
    expect(saved[0].basis).toBe("stated");
    expect(new Date(saved[0].updatedAt).getTime()).toBeGreaterThanOrEqual(before);
  });

  it("returns ok:false when persistence throws, without throwing", async () => {
    const tools = buildIdentifyTools(async () => {
      throw new Error("db down");
    });

    const result = await tools.identify_interviewer.execute!(
      { basis: "inferred" },
      execOpts,
    );

    expect(result).toEqual({ ok: false, error: "db down" });
  });

  it("rejects input with a missing basis field", async () => {
    const tools = buildIdentifyTools(async () => {});
    await expect(
      tools.identify_interviewer.execute!({ name: "Sarah" } as never, execOpts),
    ).rejects.toThrow();
  });
});
