import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConversationDetail } from "@/components/admin/details/conversation-detail";
import type { Conversation } from "@/lib/db/schema";

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

describe("ConversationDetail", () => {
  it("renders the transcript turns", () => {
    render(
      <ConversationDetail
        conversation={conv({
          transcript: [
            { role: "user", text: "Hello there", at: "2026-05-22T00:00:00.000Z" },
            { role: "assistant", text: "Hi! How can I help?", at: "2026-05-22T00:01:00.000Z" },
          ],
        })}
      />,
    );
    expect(screen.getByText("Hello there")).toBeInTheDocument();
    expect(screen.getByText("Hi! How can I help?")).toBeInTheDocument();
  });

  it("shows the interviewer identity block when identified", () => {
    render(
      <ConversationDetail
        conversation={conv({
          interviewer: {
            name: "Sarah Lee",
            company: "Acme",
            role: "VP Eng",
            notes: "Warm intro via a mutual contact.",
            basis: "stated",
            updatedAt: "2026-05-22T00:00:00.000Z",
          },
        })}
      />,
    );
    expect(screen.getByText("Acme")).toBeInTheDocument();
    expect(screen.getByText("VP Eng")).toBeInTheDocument();
    expect(screen.getByText(/Warm intro/)).toBeInTheDocument();
  });

  it("omits the identity block for a plain conversation", () => {
    render(<ConversationDetail conversation={conv({})} />);
    expect(screen.queryByText("Interviewer")).not.toBeInTheDocument();
  });
});
