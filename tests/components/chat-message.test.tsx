/** @vitest-environment jsdom */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatMessage } from "@/components/chat-message";

const REPO = "https://github.com/test/repo";
const BRANCH = "main";

describe("ChatMessage", () => {
  it("renders a user message as plain text", () => {
    render(
      <ChatMessage role="user" text="Hello there" repoUrl={REPO} branch={BRANCH} />,
    );
    expect(screen.getByText("Hello there")).toBeInTheDocument();
  });

  it("renders an assistant message with markdown", () => {
    render(
      <ChatMessage
        role="assistant"
        text="**bold** and _italic_"
        repoUrl={REPO}
        branch={BRANCH}
      />,
    );
    expect(screen.getByText("bold").tagName).toBe("STRONG");
    expect(screen.getByText("italic").tagName).toBe("EM");
  });

  it("converts a citation token into a superscript link to the github file", () => {
    render(
      <ChatMessage
        role="assistant"
        text="He founded Matrice [^kb:experience/2022-matrice.md]."
        repoUrl={REPO}
        branch={BRANCH}
      />,
    );
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/test/repo/blob/main/kb/experience/2022-matrice.md",
    );
    expect(link.tagName).toBe("A");
    expect(link.closest("sup")).not.toBeNull();
  });

  it("preserves citation anchors in the href", () => {
    render(
      <ChatMessage
        role="assistant"
        text="See [^kb:experience/2022-matrice.md#highlights]."
        repoUrl={REPO}
        branch={BRANCH}
      />,
    );
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/test/repo/blob/main/kb/experience/2022-matrice.md#highlights",
    );
  });

  it("strips dangerous HTML emitted by the model", () => {
    render(
      <ChatMessage
        role="assistant"
        text="Safe text <script>alert('xss')</script> after."
        repoUrl={REPO}
        branch={BRANCH}
      />,
    );
    expect(document.querySelector("script")).toBeNull();
    expect(screen.getByText(/Safe text/)).toBeInTheDocument();
  });

  it("renders an 'Identify yourself' button for [[identify]] marker and triggers callback", async () => {
    const onIdentify = vi.fn();
    const user = userEvent.setup();
    render(
      <ChatMessage
        role="assistant"
        text="That's behind verification. [[identify]]"
        repoUrl={REPO}
        branch={BRANCH}
        onIdentify={onIdentify}
      />,
    );
    const btn = screen.getByRole("button", { name: /identify yourself/i });
    await user.click(btn);
    expect(onIdentify).toHaveBeenCalled();
  });

  it("renders 'Send this question to Alexandre' for [[forward:...]] and passes the question to the callback", async () => {
    const onForward = vi.fn();
    const user = userEvent.setup();
    render(
      <ChatMessage
        role="assistant"
        text="Not in the KB — [[forward:What were Q1 numbers?]]"
        repoUrl={REPO}
        branch={BRANCH}
        onForward={onForward}
      />,
    );
    const btn = screen.getByRole("button", { name: /send this question/i });
    await user.click(btn);
    expect(onForward).toHaveBeenCalledWith("What were Q1 numbers?");
  });
});
