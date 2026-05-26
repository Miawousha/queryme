import { describe, it, expect } from "vitest";
import path from "node:path";
import { loadEvals } from "@/evals/index";

describe("loadEvals", () => {
  it("parses every YAML in the directory and validates the shape", async () => {
    const dir = path.resolve(__dirname, "../fixtures/evals");
    const evals = await loadEvals(dir);
    expect(evals).toHaveLength(1);
    expect(evals[0]).toMatchObject({
      id: "01-fixture",
      question: "What is X?",
      language: "en",
      mustCite: ["profile.yaml"],
      mustContain: ["fixture"],
      mustNotContain: ["forbidden"],
    });
  });
});
