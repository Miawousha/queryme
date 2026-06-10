import { describe, it, expect } from "vitest";
import { handleKbFile } from "@/lib/kb/handlers";

// PERSONA_LOCAL_OVERRIDE (vitest.setup.ts) makes any accountId resolve to the
// fixture persona, so the handler serves tests/fixtures/persona/kb/.
const ACCOUNT_ID = "local-override";

function get(pathParam: string | null): Promise<Response> {
  const url = new URL("http://localhost/api/a/fixture/kb/file");
  if (pathParam !== null) url.searchParams.set("path", pathParam);
  // The handler only reads `req.nextUrl`; a plain Request is structurally fine.
  return handleKbFile(new Request(url) as never, ACCOUNT_ID);
}

describe("handleKbFile", () => {
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
    // profile.yaml exists in the fixture persona's kb/ directory.
    const res = await get("profile.yaml");
    expect(res.status).toBe(200);
    expect((await res.text()).length).toBeGreaterThan(0);
  });
});
