import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

beforeEach(() => {
  process.env.VERCEL_TOKEN = "tok";
  process.env.VERCEL_PROJECT_ID = "prj";
  delete process.env.VERCEL_TEAM_ID;
});
afterEach(() => vi.unstubAllGlobals());

describe("vercelDomains.add", () => {
  it("POSTs the host and returns the parsed body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ name: "cv.alex.com", verified: false }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { vercelDomains } = await import("@/lib/domains/vercel");
    const out = await vercelDomains.add("cv.alex.com");
    expect(out.name).toBe("cv.alex.com");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.vercel.com/v10/projects/prj/domains");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ name: "cv.alex.com" });
    expect(init.headers.Authorization).toBe("Bearer tok");
  });

  it("throws VercelApiError on a non-2xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { code: "domain_already_in_use", message: "taken" } }), {
          status: 409,
        }),
      ),
    );
    const { vercelDomains, VercelApiError } = await import("@/lib/domains/vercel");
    await expect(vercelDomains.add("cv.alex.com")).rejects.toBeInstanceOf(VercelApiError);
  });
});
