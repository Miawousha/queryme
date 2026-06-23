import { describe, it, expect } from "vitest";
import { buildReportMailto } from "@/lib/report/mailto";

describe("buildReportMailto", () => {
  it("builds a mailto with the email, an identifying subject, and a prefilled body", () => {
    const href = buildReportMailto("abuse@queritae.com", { slug: "octocat", url: "https://queritae.com/octocat" });
    expect(href.startsWith("mailto:abuse@queritae.com?")).toBe(true);
    const qs = new URLSearchParams(href.slice(href.indexOf("?") + 1));
    expect(qs.get("subject")).toContain("octocat");
    expect(qs.get("body")).toContain("https://queritae.com/octocat");
  });

  it("URL-encodes special characters", () => {
    const href = buildReportMailto("abuse@queritae.com", { slug: "a b", url: "https://x/y?z=1" });
    expect(href).not.toContain(" ");
    expect(href).toContain("https%3A%2F%2Fx%2Fy%3Fz%3D1");
  });
});
