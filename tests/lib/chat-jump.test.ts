/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { chatMessageDomId, jumpToChatMessage } from "@/lib/chat-jump";

function makeMessage(root: HTMLElement, messageId: string): HTMLElement {
  const el = document.createElement("div");
  el.id = chatMessageDomId(messageId);
  el.scrollIntoView = vi.fn();
  root.appendChild(el);
  return el;
}

describe("chatMessageDomId", () => {
  it("prefixes the message id", () => {
    expect(chatMessageDomId("abc-123")).toBe("msg-abc-123");
  });
});

describe("jumpToChatMessage", () => {
  let root: HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers();
    root = document.createElement("div");
    document.body.appendChild(root);
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("scrolls the target message into view and flashes it", () => {
    const el = makeMessage(root, "m1");

    expect(jumpToChatMessage(root, "m1")).toBe(true);
    expect(el.scrollIntoView).toHaveBeenCalledWith({ block: "start" });
    expect(el.classList.contains("kb-flash-target")).toBe(true);
  });

  it("removes the flash class after the flash duration", () => {
    const el = makeMessage(root, "m1");
    jumpToChatMessage(root, "m1");

    vi.advanceTimersByTime(1600);
    expect(el.classList.contains("kb-flash-target")).toBe(false);
  });

  it("returns false when the message is not rendered", () => {
    expect(jumpToChatMessage(root, "ghost")).toBe(false);
  });

  it("returns false when the root is null", () => {
    expect(jumpToChatMessage(null, "m1")).toBe(false);
  });

  it("queries scoped to the root — never the whole document", () => {
    // Same-id element OUTSIDE the chat container must not be targeted.
    const outside = document.createElement("div");
    outside.id = chatMessageDomId("m1");
    outside.scrollIntoView = vi.fn();
    document.body.appendChild(outside);

    expect(jumpToChatMessage(root, "m1")).toBe(false);
    expect(outside.scrollIntoView).not.toHaveBeenCalled();

    // The in-root copy wins once it exists.
    const inside = makeMessage(root, "m1");
    expect(jumpToChatMessage(root, "m1")).toBe(true);
    expect(inside.scrollIntoView).toHaveBeenCalled();
    expect(outside.scrollIntoView).not.toHaveBeenCalled();
  });
});
