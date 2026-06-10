import { describe, it, expect, vi, beforeEach } from "vitest";

const loadActiveAccountForSlug = vi.fn();
const handleForward = vi.fn();
const ensureReady = vi.fn(async () => {});
const getRoot = vi.fn(() => "/persona/root" as string | null);
const getCachedKb = vi.fn();

vi.mock("@/lib/accounts/load", () => ({ loadActiveAccountForSlug }));
vi.mock("@/lib/questions/handle-forward", () => ({ handleForward }));
vi.mock("@/lib/persona/store", () => ({ getPersonaStore: () => ({ ensureReady, getRoot }) }));
vi.mock("@/lib/kb/cache", () => ({ getCachedKb }));
vi.mock("@/lib/notify/email", () => ({ resendTransport: () => ({ send: async () => ({ id: "x" }) }) }));

function req() {
  return new Request("http://x/api/a/dana/forward-question", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question: "q" }),
  }) as never;
}
const ctx = (username: string) => ({ params: Promise.resolve({ username }) });

beforeEach(() => {
  vi.clearAllMocks();
  getRoot.mockReturnValue("/persona/root");
});

describe("POST /api/a/[username]/forward-question", () => {
  it("404s when the account does not exist", async () => {
    loadActiveAccountForSlug.mockResolvedValue(null);
    const { POST } = await import("@/app/api/a/[username]/forward-question/route");
    const res = await POST(req(), ctx("ghost"));
    expect(res.status).toBe(404);
    expect(handleForward).not.toHaveBeenCalled();
  });

  it("routes the notification to the account persona's public-contact email", async () => {
    loadActiveAccountForSlug.mockResolvedValue({ id: "acct-x", username: "dana" });
    getCachedKb.mockResolvedValue({ publicContact: { email: "dana@studio.example" } });
    handleForward.mockResolvedValue(new Response(null, { status: 200 }));
    const { POST } = await import("@/app/api/a/[username]/forward-question/route");
    const res = await POST(req(), ctx("dana"));
    expect(res.status).toBe(200);
    expect(handleForward).toHaveBeenCalledTimes(1);
    const deps = handleForward.mock.calls[0][1] as { notifyTo: string };
    expect(deps.notifyTo).toBe("dana@studio.example");
  });
});
