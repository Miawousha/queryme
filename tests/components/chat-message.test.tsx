/** @vitest-environment jsdom */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatMessage } from "@/components/chat-message";

// Localized labels are required props; tests supply fixed English values.
const labels = { agentLabel: "agent", forwardLabel: "Send this question to Alexandre" };

describe("ChatMessage", () => {
  it("renders a user message as plain text", () => {
    render(<ChatMessage role="user" text="Hello there" {...labels} />);
    expect(screen.getByText("Hello there")).toBeInTheDocument();
  });

  it("renders an assistant message with markdown", () => {
    render(<ChatMessage role="assistant" text="**bold** and _italic_" {...labels} />);
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
        {...labels}
      />,
    );
    const btn = screen.getByRole("button");
    expect(btn.tagName).toBe("BUTTON");
    expect(btn.closest("sup")).not.toBeNull();
    await user.click(btn);
    expect(onOpenArtifact).toHaveBeenCalledWith("experience/2022-matrice.md", null);
  });

  it("opens the cited file for an anchored citation token", async () => {
    const onOpenArtifact = vi.fn();
    const user = userEvent.setup();
    render(
      <ChatMessage
        role="assistant"
        text="See [^kb:experience/2022-matrice.md#highlights]."
        onOpenArtifact={onOpenArtifact}
        {...labels}
      />,
    );
    await user.click(screen.getByRole("button"));
    expect(onOpenArtifact).toHaveBeenCalledWith("experience/2022-matrice.md", "highlights");
  });

  it("passes the anchor through and numbers from citationIndices", async () => {
    const onOpenArtifact = vi.fn();
    const user = userEvent.setup();
    render(
      <ChatMessage
        role="assistant"
        text="Built it [^kb:experience/2022-matrice.md#telemetry]."
        agentLabel="agent"
        forwardLabel="forward"
        onOpenArtifact={onOpenArtifact}
        citationIndices={{ "experience/2022-matrice.md#telemetry": 4 }}
      />,
    );
    const btn = await screen.findByRole("button", { name: "[4]" });
    await user.click(btn);
    expect(onOpenArtifact).toHaveBeenCalledWith("experience/2022-matrice.md", "telemetry");
  });

  it("strips dangerous HTML emitted by the model", () => {
    render(
      <ChatMessage
        role="assistant"
        text="Safe text <script>alert('xss')</script> after."
        {...labels}
      />,
    );
    expect(document.querySelector("script")).toBeNull();
    expect(screen.getByText(/Safe text/)).toBeInTheDocument();
  });

  it("renders the forward label for [[forward:...]] and passes the question to the callback", async () => {
    const onForward = vi.fn();
    const user = userEvent.setup();
    render(
      <ChatMessage
        role="assistant"
        text="Not in the KB — [[forward:What were Q1 numbers?]]"
        onForward={onForward}
        {...labels}
      />,
    );
    const btn = screen.getByRole("button", { name: /send this question/i });
    await user.click(btn);
    expect(onForward).toHaveBeenCalledWith("What were Q1 numbers?", "");
  });

  it("clicking forward opens a contact prompt; submitting calls onForward with question + contact", async () => {
    const onForward = vi.fn();
    const user = userEvent.setup();
    render(
      <ChatMessage
        role="assistant"
        text="Here's a thing. [[forward:What's the cache hit rate at Maxwell?]]"
        agentLabel="agent"
        forwardLabel="Forward"
        forwardStrings={{
          prompt: "Want a reply? Leave a contact (optional).",
          placeholder: "Email or LinkedIn URL",
          send: "Send to Alexandre",
          cancel: "Cancel",
        }}
        onForward={onForward}
      />,
    );
    await user.click(screen.getByRole("button", { name: /forward/i }));
    expect(screen.getByText(/want a reply/i)).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText(/email or linkedin/i), "sarah@acme.example");
    await user.click(screen.getByRole("button", { name: /send to alexandre/i }));
    expect(onForward).toHaveBeenCalledWith(
      "What's the cache hit rate at Maxwell?",
      "sarah@acme.example",
    );
  });

  it("submitting without a contact still forwards with empty contact", async () => {
    const onForward = vi.fn();
    const user = userEvent.setup();
    render(
      <ChatMessage
        role="assistant"
        text="[[forward:plain question]]"
        agentLabel="agent"
        forwardLabel="Forward"
        forwardStrings={{
          prompt: "Want a reply? Leave a contact (optional).",
          placeholder: "Email or LinkedIn URL",
          send: "Send to Alexandre",
          cancel: "Cancel",
        }}
        onForward={onForward}
      />,
    );
    await user.click(screen.getByRole("button", { name: /forward/i }));
    await user.click(screen.getByRole("button", { name: /send to alexandre/i }));
    expect(onForward).toHaveBeenCalledWith("plain question", "");
  });
});
