import { describe, it, expect } from "vitest";
import { buildAuthorizeUrl } from "@/lib/auth/github";

describe("buildAuthorizeUrl", () => {
  it("includes client_id, redirect_uri, read:user scope and state", () => {
    const url = new URL(
      buildAuthorizeUrl({ clientId: "cid", redirectUri: "https://x/cb", state: "st" }),
    );
    expect(url.origin + url.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("cid");
    expect(url.searchParams.get("redirect_uri")).toBe("https://x/cb");
    expect(url.searchParams.get("scope")).toBe("read:user");
    expect(url.searchParams.get("state")).toBe("st");
  });
});
