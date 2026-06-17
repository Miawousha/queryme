import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConversationRow } from "@/components/admin/rows/conversation-row";
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

describe("ConversationRow", () => {
  it("shows the interviewer name and subtitle when identified", () => {
    render(
      <ConversationRow
        conversation={conv({
          interviewer: {
            name: "Sarah Lee",
            role: "VP Eng",
            company: "Acme",
            basis: "stated",
            updatedAt: "2026-05-22T00:00:00.000Z",
          },
        })}
      />,
    );
    expect(screen.getByText("Sarah Lee")).toBeInTheDocument();
    expect(screen.getByText(/VP Eng · Acme/)).toBeInTheDocument();
    expect(screen.getByText("stated")).toBeInTheDocument();
  });

  it("shows channel + turn count for a plain conversation", () => {
    render(
      <ConversationRow
        conversation={conv({
          channel: "mcp",
          turnCount: 1,
        })}
      />,
    );
    expect(screen.getByText("mcp")).toBeInTheDocument();
    expect(screen.getByText("1 turns")).toBeInTheDocument();
  });
});
