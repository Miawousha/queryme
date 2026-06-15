import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { webhookUrlFor } from "@/lib/auto-sync/url";

describe("webhookUrlFor", () => {
  const original = process.env.NEXT_PUBLIC_SITE_URL;
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://queritae.com";
  });
  afterEach(() => {
    process.env.NEXT_PUBLIC_SITE_URL = original;
  });

  it("builds an absolute sync-webhook URL for the username", () => {
    expect(webhookUrlFor("alex")).toBe("https://queritae.com/api/a/alex/sync-webhook");
  });

  it("strips a trailing slash on the configured origin", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://queritae.com/";
    expect(webhookUrlFor("alex")).toBe("https://queritae.com/api/a/alex/sync-webhook");
  });

  it("url-encodes the username", () => {
    expect(webhookUrlFor("a b")).toBe("https://queritae.com/api/a/a%20b/sync-webhook");
  });

  it("falls back to localhost when unset", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    expect(webhookUrlFor("alex")).toBe("http://localhost:3000/api/a/alex/sync-webhook");
  });
});
