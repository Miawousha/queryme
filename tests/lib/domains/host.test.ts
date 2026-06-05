import { describe, it, expect, vi } from "vitest";
import { isPlatformHost, resolveCustomHost, customHostTarget } from "@/lib/domains/host";

describe("isPlatformHost", () => {
  it("treats localhost, 127.*, *.vercel.app, and PLATFORM_HOST as platform", () => {
    expect(isPlatformHost("localhost", "queryme.app")).toBe(true);
    expect(isPlatformHost("127.0.0.1", "queryme.app")).toBe(true);
    expect(isPlatformHost("queryme-abc.vercel.app", "queryme.app")).toBe(true);
    expect(isPlatformHost("queryme.app", "queryme.app")).toBe(true);
    expect(isPlatformHost("www.queryme.app", "queryme.app")).toBe(true);
  });
  it("treats a custom domain as non-platform", () => {
    expect(isPlatformHost("cv.alex.com", "queryme.app")).toBe(false);
  });
});

describe("resolveCustomHost", () => {
  it("returns the slug from the lookup", async () => {
    expect(await resolveCustomHost("cv.alex.com", async () => "alex")).toBe("alex");
  });
  it("fails open to null when the lookup throws", async () => {
    const lookup = vi.fn().mockRejectedValue(new Error("kv down"));
    expect(await resolveCustomHost("cv.alex.com", lookup)).toBeNull();
  });
});

describe("customHostTarget", () => {
  it("maps the vanity-hosted home and CV paths to the tenant", () => {
    expect(customHostTarget("/", "alex")).toBe("/alex");
    expect(customHostTarget("/cv", "alex")).toBe("/alex/cv");
  });
  it("returns null for any non-vanity path (passes through)", () => {
    expect(customHostTarget("/about", "alex")).toBeNull();
    expect(customHostTarget("/alex/cv", "alex")).toBeNull();
    expect(customHostTarget("/cv/extra", "alex")).toBeNull();
  });
});
