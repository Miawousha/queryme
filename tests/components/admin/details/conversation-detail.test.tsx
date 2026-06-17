import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConversationDetail } from "@/components/admin/details/conversation-detail";
import type { ConversationListItem } from "@/lib/admin/data";

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

describe("ConversationDetail", () => {
  it("renders the transcript turns", () => {
    render(
      <ConversationDetail
        conversation={conv({ turnCount: 2 })}
        transcript={[
          { role: "user", text: "Hello there", at: "2026-05-22T00:00:00.000Z" },
          { role: "assistant", text: "Hi! How can I help?", at: "2026-05-22T00:01:00.000Z" },
        ]}
      />,
    );
    expect(screen.getByText("Hello there")).toBeInTheDocument();
    expect(screen.getByText("Hi! How can I help?")).toBeInTheDocument();
  });

  it("shows a loading state until the transcript arrives", () => {
    render(<ConversationDetail conversation={conv({ turnCount: 2 })} transcript={null} />);
    expect(screen.getByText(/loading transcript/i)).toBeInTheDocument();
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
        transcript={[]}
      />,
    );
    expect(screen.getByText("Acme")).toBeInTheDocument();
    expect(screen.getByText("VP Eng")).toBeInTheDocument();
    expect(screen.getByText(/Warm intro/)).toBeInTheDocument();
  });

  it("omits the identity block for a plain conversation", () => {
    render(<ConversationDetail conversation={conv({})} transcript={[]} />);
    expect(screen.queryByText("Interviewer")).not.toBeInTheDocument();
  });
});
