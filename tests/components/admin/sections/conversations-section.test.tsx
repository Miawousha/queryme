import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConversationsSection } from "@/components/admin/sections/conversations-section";
import type { ConversationListItem } from "@/lib/admin/data";

const nav = vi.hoisted(() => ({
  push: vi.fn(),
  pathname: "/alex/admin",
  params: new URLSearchParams(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => nav.pathname,
  useSearchParams: () => nav.params,
}));

function conv(overrides: Partial<ConversationListItem>): ConversationListItem {
  return {
    id: "c1",
    channel: "chat",
    language: null,
    interviewer: null,
    startedAt: new Date(0),
    lastMessageAt: new Date(0),
    accountId: null,
    turnCount: 0,
    ...overrides,
  };
}

const items: ConversationListItem[] = [
  conv({ id: "c1", channel: "chat" }),
  conv({
    id: "c2",
    channel: "mcp",
    interviewer: { name: "Sarah Lee", basis: "stated", updatedAt: "2026-05-22T00:00:00.000Z" },
  }),
];

const API = "/api/a/alex/admin";

beforeEach(() => {
  nav.push.mockReset();
  nav.pathname = "/alex/admin";
  nav.params = new URLSearchParams();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ transcript: [] }), { status: 200 }),
    ),
  );
});

afterEach(() => vi.unstubAllGlobals());

describe("ConversationsSection", () => {
  it("filters to interviewers when the segment is selected", async () => {
    render(<ConversationsSection conversations={items} apiBasePath={API} />);
    expect(screen.getByText("Sarah Lee")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /interviewers/i }));
    // The plain conversation row's channel badge is gone; the interviewer stays.
    expect(screen.getByText("Sarah Lee")).toBeInTheDocument();
    expect(screen.queryByText("chat")).not.toBeInTheDocument();
  });

  it("pushes ?c=<id> to the URL when a row is selected", async () => {
    render(<ConversationsSection conversations={items} apiBasePath={API} />);
    await userEvent.click(screen.getByText("Sarah Lee"));
    expect(nav.push).toHaveBeenCalledWith("/alex/admin?c=c2");
  });

  it("opens the detail and fetches the transcript for the conversation named by ?c=", async () => {
    nav.params = new URLSearchParams("c=c2");
    render(<ConversationsSection conversations={items} apiBasePath={API} />);
    // Detail sidebar shows the interviewer identity block (from the list item).
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Sarah Lee")).toBeInTheDocument();
    // The transcript is loaded on demand from the per-conversation endpoint.
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(`${API}/conversations/c2`),
    );
  });
});
