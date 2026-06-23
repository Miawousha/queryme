import { describe, it, expect } from "vitest";
import { buildSignatureSnippet } from "@/lib/brand/signature-snippet";

describe("buildSignatureSnippet", () => {
  it("links the badge to the profile with a signature ref param", () => {
    const out = buildSignatureSnippet({
      profileUrl: "https://queritae.com/alex",
      origin: "https://queritae.com",
      color: "ink",
    });
    expect(out).toContain('href="https://queritae.com/alex?ref=signature"');
    expect(out).toContain('src="https://queritae.com/badge/queritae-ink.png"');
    expect(out).toContain('width="24" height="24"');
    expect(out).toContain('alt="Queritae"');
  });

  it("references the white png when color=white", () => {
    const out = buildSignatureSnippet({ profileUrl: "https://x.com", origin: "https://queritae.com", color: "white" });
    expect(out).toContain("queritae-white.png");
  });

  it("uses & when the profile url already has a query", () => {
    const out = buildSignatureSnippet({ profileUrl: "https://q.com/a?x=1", origin: "https://q.com", color: "ink" });
    expect(out).toContain('href="https://q.com/a?x=1&ref=signature"');
  });

  it("trims a trailing slash on origin", () => {
    const out = buildSignatureSnippet({ profileUrl: "https://q.com/a", origin: "https://queritae.com/", color: "ink" });
    expect(out).toContain('src="https://queritae.com/badge/queritae-ink.png"');
  });
});
