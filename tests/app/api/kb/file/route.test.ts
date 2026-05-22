import { describe, it, expect } from "vitest";
import { GET } from "@/app/api/kb/file/route";

function get(pathParam: string | null): Promise<Response> {
  const url = new URL("http://localhost/api/kb/file");
  if (pathParam !== null) url.searchParams.set("path", pathParam);
  // The route only reads `req.nextUrl`; a plain Request is structurally fine.
  return GET(new Request(url) as never);
}

describe("GET /api/kb/file", () => {
  it("400s when no path is given", async () => {
    expect((await get(null)).status).toBe(400);
  });

  it("404s a path-traversal attempt", async () => {
    expect((await get("../package.json")).status).toBe(404);
    expect((await get("../../etc/passwd")).status).toBe(404);
  });

  it("404s a path that is not in the manifest", async () => {
    expect((await get("does-not-exist.md")).status).toBe(404);
  });

  it("serves a real KB file with its content", async () => {
    // profile.yaml exists in the real kb/ directory.
    const res = await get("profile.yaml");
    expect(res.status).toBe(200);
    expect((await res.text()).length).toBeGreaterThan(0);
  });
});
