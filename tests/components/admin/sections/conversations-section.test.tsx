import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConversationsSection } from "@/components/admin/sections/conversations-section";
import type { Conversation } from "@/lib/db/schema";

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

function conv(overrides: Partial<Conversation>): Conversation {
  return {
    id: "c1",
    channel: "chat",
    language: null,
    transcript: [],
    interviewer: null,
    startedAt: new Date(0),
    lastMessageAt: new Date(0),
    accountId: null,
    ...overrides,
  };
}

const items: Conversation[] = [
  conv({ id: "c1", channel: "chat" }),
  conv({
    id: "c2",
    channel: "mcp",
    interviewer: { name: "Sarah Lee", basis: "stated", updatedAt: "2026-05-22T00:00:00.000Z" },
  }),
];

beforeEach(() => {
  nav.push.mockReset();
  nav.pathname = "/alex/admin";
  nav.params = new URLSearchParams();
});

describe("ConversationsSection", () => {
  it("filters to interviewers when the segment is selected", async () => {
    render(<ConversationsSection conversations={items} />);
    expect(screen.getByText("Sarah Lee")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /interviewers/i }));
    // The plain conversation row's channel badge is gone; the interviewer stays.
    expect(screen.getByText("Sarah Lee")).toBeInTheDocument();
    expect(screen.queryByText("chat")).not.toBeInTheDocument();
  });

  it("pushes ?c=<id> to the URL when a row is selected", async () => {
    render(<ConversationsSection conversations={items} />);
    await userEvent.click(screen.getByText("Sarah Lee"));
    expect(nav.push).toHaveBeenCalledWith("/alex/admin?c=c2");
  });

  it("opens the detail for the conversation named by ?c=", () => {
    nav.params = new URLSearchParams("c=c2");
    render(<ConversationsSection conversations={items} />);
    // Detail sidebar shows the interviewer identity block.
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    // The interviewer name renders inside the detail panel (c2's identity).
    expect(within(dialog).getByText("Sarah Lee")).toBeInTheDocument();
  });
});
