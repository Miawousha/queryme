/** @vitest-environment jsdom */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatMessage } from "@/components/chat-message";

describe("ChatMessage", () => {
  it("renders a user message as plain text", () => {
    render(<ChatMessage role="user" text="Hello there" />);
    expect(screen.getByText("Hello there")).toBeInTheDocument();
  });

  it("renders an assistant message with markdown", () => {
    render(<ChatMessage role="assistant" text="**bold** and _italic_" />);
    expect(screen.getByText("bold").tagName).toBe("STRONG");
    expect(screen.getByText("italic").tagName).toBe("EM");
  });

  it("converts a citation token into a superscript button that opens the cited file", async () => {
    const onOpenArtifact = vi.fn();
    const user = userEvent.setup();
    render(
      <ChatMessage
        role="assistant"
        text="He founded Matrice [^kb:experience/2022-matrice.md]."
        onOpenArtifact={onOpenArtifact}
      />,
    );
    const btn = screen.getByRole("button");
    expect(btn.tagName).toBe("BUTTON");
    expect(btn.closest("sup")).not.toBeNull();
    await user.click(btn);
    expect(onOpenArtifact).toHaveBeenCalledWith("experience/2022-matrice.md");
  });

  it("opens the cited file for an anchored citation token", async () => {
    const onOpenArtifact = vi.fn();
    const user = userEvent.setup();
    render(
      <ChatMessage
        role="assistant"
        text="See [^kb:experience/2022-matrice.md#highlights]."
        onOpenArtifact={onOpenArtifact}
      />,
    );
    await user.click(screen.getByRole("button"));
    expect(onOpenArtifact).toHaveBeenCalledWith("experience/2022-matrice.md");
  });

  it("strips dangerous HTML emitted by the model", () => {
    render(
      <ChatMessage
        role="assistant"
        text="Safe text <script>alert('xss')</script> after."
      />,
    );
    expect(document.querySelector("script")).toBeNull();
    expect(screen.getByText(/Safe text/)).toBeInTheDocument();
  });

  it("renders 'Send this question to Alexandre' for [[forward:...]] and passes the question to the callback", async () => {
    const onForward = vi.fn();
    const user = userEvent.setup();
    render(
      <ChatMessage
        role="assistant"
        text="Not in the KB — [[forward:What were Q1 numbers?]]"
        onForward={onForward}
      />,
    );
    const btn = screen.getByRole("button", { name: /send this question/i });
    await user.click(btn);
    expect(onForward).toHaveBeenCalledWith("What were Q1 numbers?");
  });
});
