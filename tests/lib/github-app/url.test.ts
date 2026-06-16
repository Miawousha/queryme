import { describe, it, expect, afterEach } from "vitest";
import { appInstallUrl } from "@/lib/github-app/url";

const original = process.env.GITHUB_APP_SLUG;
afterEach(() => {
  if (original === undefined) delete process.env.GITHUB_APP_SLUG;
  else process.env.GITHUB_APP_SLUG = original;
});

describe("appInstallUrl", () => {
  it("builds the install URL from the slug", () => {
    process.env.GITHUB_APP_SLUG = "queritae";
    expect(appInstallUrl()).toBe("https://github.com/apps/queritae/installations/new");
  });
  it("returns null when the slug is unset", () => {
    delete process.env.GITHUB_APP_SLUG;
    expect(appInstallUrl()).toBeNull();
  });
});
