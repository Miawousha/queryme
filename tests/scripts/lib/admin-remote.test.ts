import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { mswServer } from "@/vitest.setup";
import {
  extractCookie,
  login,
  fetchStatus,
  postSync,
  AdminRemoteError,
} from "@/scripts/lib/admin-remote";

const BASE = "https://deployed.example.com";

describe("extractCookie", () => {
  it("pulls the named cookie value from Set-Cookie headers", () => {
    const headers = ["other=1; Path=/", "queryme_admin=abc.def; HttpOnly; Path=/"];
    expect(extractCookie(headers, "queryme_admin")).toBe("abc.def");
  });
  it("returns null when the cookie is absent", () => {
    expect(extractCookie(["other=1"], "queryme_admin")).toBeNull();
  });
});

describe("login", () => {
  it("returns the session cookie on success", async () => {
    mswServer.use(
      http.post(`${BASE}/api/admin/login`, () =>
        HttpResponse.json(
          { ok: true },
          { headers: { "Set-Cookie": "queryme_admin=tok123; HttpOnly; Path=/" } },
        ),
      ),
    );
    expect(await login(BASE, "pw")).toBe("tok123");
  });

  it("maps 401 to an incorrect-password error", async () => {
    mswServer.use(
      http.post(`${BASE}/api/admin/login`, () =>
        HttpResponse.json({ error: "Incorrect password" }, { status: 401 }),
      ),
    );
    await expect(login(BASE, "pw")).rejects.toMatchObject({
      name: "AdminRemoteError",
      message: expect.stringMatching(/incorrect admin password/i),
    });
  });

  it("maps 429 to a rate-limit error", async () => {
    mswServer.use(
      http.post(`${BASE}/api/admin/login`, () =>
        HttpResponse.json({ error: "Too many" }, { status: 429 }),
      ),
    );
    await expect(login(BASE, "pw")).rejects.toMatchObject({
      message: expect.stringMatching(/rate-limited/i),
    });
  });
});

describe("fetchStatus", () => {
  it("sends the cookie and returns active+history", async () => {
    let sentCookie: string | null = null;
    mswServer.use(
      http.get(`${BASE}/api/admin/persona-source`, ({ request }) => {
        sentCookie = request.headers.get("cookie");
        return HttpResponse.json({ active: { commitSha: "s1" }, history: [] });
      }),
    );
    const out = await fetchStatus(BASE, "tok123");
    expect(out).toEqual({ active: { commitSha: "s1" }, history: [] });
    expect(sentCookie).toContain("queryme_admin=tok123");
  });
});

describe("postSync", () => {
  it("posts repoUrl+branch and returns commit info", async () => {
    let body: unknown = null;
    mswServer.use(
      http.post(`${BASE}/api/admin/persona-source`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ commitSha: "s2", syncedAt: "2026-05-29T00:00:00Z" });
      }),
    );
    const out = await postSync(BASE, "tok123", { repoUrl: "https://github.com/a/b", branch: "main" });
    expect(out).toMatchObject({ commitSha: "s2" });
    expect(body).toEqual({ repoUrl: "https://github.com/a/b", branch: "main" });
  });

  it("surfaces the server error message on 400", async () => {
    mswServer.use(
      http.post(`${BASE}/api/admin/persona-source`, () =>
        HttpResponse.json({ error: "missing required file(s): persona.yaml" }, { status: 400 }),
      ),
    );
    await expect(
      postSync(BASE, "tok123", { repoUrl: "https://github.com/a/b", branch: "main" }),
    ).rejects.toMatchObject({ message: expect.stringMatching(/missing required file/i) });
  });
});

describe("AdminRemoteError", () => {
  it("carries an optional hint", () => {
    expect(new AdminRemoteError("m", "h").hint).toBe("h");
  });
});
