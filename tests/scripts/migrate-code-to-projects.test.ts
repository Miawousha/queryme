import { describe, it, expect } from "vitest";
import { proposePlan, type CodeRepo } from "@/scripts/migrate-code-to-projects";

const REPOS: CodeRepo[] = [
  { slug: "a", repo: { name: "a", role: "author", tags: ["ai"] }, body: "" },
  { slug: "b", repo: { name: "b", role: "author", tags: ["ai"] }, body: "" },
  { slug: "c", repo: { name: "c", role: "author" }, body: "" },
];

describe("proposePlan", () => {
  it("groups repos by their primary tag, tagless under open-source", () => {
    const plan = proposePlan(REPOS);
    const ai = plan.projects.find((p) => p.slug === "ai");
    const os = plan.projects.find((p) => p.slug === "open-source");
    expect(ai?.repos).toEqual(["a", "b"]);
    expect(os?.repos).toEqual(["c"]);
  });

  it("is lossless — every input slug appears exactly once", () => {
    const plan = proposePlan(REPOS);
    const assigned = plan.projects.flatMap((p) => p.repos).sort();
    expect(assigned).toEqual(["a", "b", "c"]);
  });
});
