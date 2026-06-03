import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QuestionDetail } from "@/components/admin/details/question-detail";
import type { ForwardedQuestion } from "@/lib/db/schema";

function q(overrides: Partial<ForwardedQuestion>): ForwardedQuestion {
  return {
    id: "q1",
    conversationId: "c1",
    question: "What is your notice period?",
    contact: "sarah@acme.com",
    reply: null,
    answeredAt: null,
    createdAt: new Date(0),
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
});
afterEach(() => vi.unstubAllGlobals());

describe("QuestionDetail", () => {
  it("posts a reply to the reply endpoint", async () => {
    render(<QuestionDetail question={q({})} apiBasePath="/api/a/alex/admin" onOpenConversation={() => {}} />);
    await userEvent.type(screen.getByRole("textbox"), "Two weeks.");
    await userEvent.click(screen.getByRole("button", { name: /send reply/i }));
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/a/alex/admin/questions/q1/reply",
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });

  it("invokes onOpenConversation with the linked conversation id", async () => {
    const onOpen = vi.fn();
    render(<QuestionDetail question={q({})} apiBasePath="/api/a/alex/admin" onOpenConversation={onOpen} />);
    await userEvent.click(screen.getByRole("button", { name: /open conversation/i }));
    expect(onOpen).toHaveBeenCalledWith("c1");
  });
});
