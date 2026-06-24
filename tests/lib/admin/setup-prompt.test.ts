import { describe, it, expect } from "vitest";
import { buildAgentPrompt } from "@/lib/admin/setup-prompt";

describe("buildAgentPrompt", () => {
  const base = {
    origin: "https://queritae.com",
    username: "ada",
    token: "setup.abc.123.sig",
    appInstallUrl: "https://github.com/apps/queritae/installations/new",
  };

  it("includes the guide URL, the register endpoint, and the bearer token", () => {
    const p = buildAgentPrompt(base);
    expect(p).toContain("https://queritae.com/setup-guide.md");
    expect(p).toContain("https://queritae.com/api/a/ada/admin/persona-source");
    expect(p).toContain("Authorization: Bearer setup.abc.123.sig");
    expect(p).toContain("expires"); // expiry warning present
  });

  it("points the user at the App install when available", () => {
    expect(buildAgentPrompt(base)).toContain(base.appInstallUrl);
  });

  it("omits the App line when no install URL", () => {
    const p = buildAgentPrompt({ ...base, appInstallUrl: null });
    expect(p).not.toContain("installations/new");
  });
});
