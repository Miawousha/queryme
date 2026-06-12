import { describe, it, expect } from "vitest";
import { GET } from "@/app/setup-guide.md/route";

describe("GET /setup-guide.md", () => {
  it("serves the agent preamble followed by the content-repo guide as markdown", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/markdown");

    const body = await res.text();
    // Preamble first, schema reference second.
    const preambleAt = body.indexOf("# Queritae KB setup — agent instructions");
    const guideAt = body.indexOf("# Building Your Content Repo (Knowledge Base)");
    expect(preambleAt).toBeGreaterThanOrEqual(0);
    expect(guideAt).toBeGreaterThan(preambleAt);
    // Spot-check that real schema content is present.
    expect(body).toContain("kb/profile.yaml");
    expect(body).toContain("prompts/system.md");
  });
});
