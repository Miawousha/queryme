import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { QuestionRow } from "@/components/admin/rows/question-row";
import type { ForwardedQuestion } from "@/lib/db/schema";

function q(overrides: Partial<ForwardedQuestion>): ForwardedQuestion {
  return {
    id: "q1",
    conversationId: "c1",
    question: "What is your salary expectation?",
    contact: null,
    reply: null,
    answeredAt: null,
    createdAt: new Date(0),
    ...overrides,
  };
}

describe("QuestionRow", () => {
  it("marks an unanswered question", () => {
    render(<QuestionRow question={q({})} />);
    expect(screen.getByText("What is your salary expectation?")).toBeInTheDocument();
    expect(screen.getByText(/unanswered/i)).toBeInTheDocument();
  });
  it("marks an answered question", () => {
    render(<QuestionRow question={q({ answeredAt: new Date("2026-05-22T00:00:00Z") })} />);
    expect(screen.getByText(/^answered/i)).toBeInTheDocument();
  });
});
