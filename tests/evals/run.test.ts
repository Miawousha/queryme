import { describe, it, expect } from "vitest";
import { evaluateAnswer } from "@/evals/run";

const baseQuestion = {
  id: "x",
  question: "Q",
  language: "en" as const,
  mustCite: ["profile.yaml"],
  mustContain: ["Alexandre"],
  mustNotContain: ["never"],
};

describe("evaluateAnswer", () => {
  it("passes when every required citation and phrase is present", () => {
    const r = evaluateAnswer(baseQuestion, "Alexandre is real [^kb:profile.yaml].");
    expect(r.passed).toBe(true);
    expect(r.failures).toEqual([]);
  });

  it("fails with a specific reason when a required citation is missing", () => {
    const r = evaluateAnswer(baseQuestion, "Alexandre is real.");
    expect(r.passed).toBe(false);
    expect(r.failures.some((f) => f.includes("profile.yaml"))).toBe(true);
  });

  it("fails when a forbidden phrase appears", () => {
    const r = evaluateAnswer(baseQuestion, "Alexandre never did that [^kb:profile.yaml].");
    expect(r.passed).toBe(false);
    expect(r.failures.some((f) => f.includes("never"))).toBe(true);
  });

  it("fails when a required phrase is missing", () => {
    const r = evaluateAnswer(baseQuestion, "Someone real [^kb:profile.yaml].");
    expect(r.passed).toBe(false);
    expect(r.failures.some((f) => f.includes("Alexandre"))).toBe(true);
  });

  it("fails on empty answer", () => {
    const r = evaluateAnswer(baseQuestion, "");
    expect(r.passed).toBe(false);
    expect(r.failures.some((f) => f.toLowerCase().includes("empty"))).toBe(true);
  });
});
