import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QuestionsSection } from "@/components/admin/sections/questions-section";
import type { ForwardedQuestion } from "@/lib/db/schema";

const nav = vi.hoisted(() => ({
  push: vi.fn(),
  pathname: "/alex/admin/questions",
  params: new URLSearchParams(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => nav.pathname,
  useSearchParams: () => nav.params,
}));

function q(overrides: Partial<ForwardedQuestion>): ForwardedQuestion {
  return {
    id: "q1",
    conversationId: "c1",
    question: "What is your notice period?",
    contact: null,
    reply: null,
    answeredAt: null,
    createdAt: new Date(0),
    ...overrides,
  };
}

beforeEach(() => {
  nav.push.mockReset();
  nav.pathname = "/alex/admin/questions";
  nav.params = new URLSearchParams();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
});
afterEach(() => vi.unstubAllGlobals());

describe("QuestionsSection", () => {
  it("pushes ?q=<id> when a question is selected", async () => {
    render(<QuestionsSection questions={[q({})]} apiBasePath="/api/a/alex/admin" adminBasePath="/alex/admin" />);
    await userEvent.click(screen.getByText("What is your notice period?"));
    expect(nav.push).toHaveBeenCalledWith("/alex/admin/questions?q=q1");
  });

  it("cross-links to the conversation on the admin index route", async () => {
    nav.params = new URLSearchParams("q=q1");
    render(<QuestionsSection questions={[q({})]} apiBasePath="/api/a/alex/admin" adminBasePath="/alex/admin" />);
    await userEvent.click(screen.getByRole("button", { name: /open conversation/i }));
    expect(nav.push).toHaveBeenCalledWith("/alex/admin?c=c1");
  });
});
