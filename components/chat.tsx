"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ChatMessage } from "@/components/chat-message";
import { StreamingMessage } from "@/components/streaming-message";
import { useKb } from "@/components/kb/kb-context";
import { extractCitedPaths } from "@/lib/kb/cited-paths";
import { cn } from "@/lib/utils";

export type ChatProps = {
  intro: string;
  placeholder: string;
  sendLabel: string;
  startersTitle: string;
  starters: string[];
};

function loadOrCreateConversationId(): string {
  if (typeof window === "undefined") return "";
  const KEY = "queryme:conversationId";
  let id = window.localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem(KEY, id);
  }
  return id;
}

export function Chat({
  intro,
  placeholder,
  sendLabel,
  startersTitle,
  starters,
}: ChatProps) {
  const { setCitedPaths, openFile } = useKb();
  const [conversationId, setConversationId] = useState("");
  const conversationIdRef = useRef("");
  useEffect(() => {
    const id = loadOrCreateConversationId();
    conversationIdRef.current = id;
    setConversationId(id);
  }, []);
  const [forwardToast, setForwardToast] = useState<string | null>(null);

  // The transport is created ONCE. `useChat` does not adopt a new transport
  // instance after mount, so the body callback must read the conversation id
  // from a ref at request time. Capturing the state value directly would pin
  // it to the empty initial render and every request would 400 on the uuid
  // check. When the id isn't ready yet, omit it — the server generates one.
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: () => {
          const id = conversationIdRef.current;
          return id ? { conversationId: id } : {};
        },
      }),
    [],
  );
  const { messages, sendMessage, status, error } = useChat({ transport });

  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  // Whether the user is pinned to the bottom of the transcript. The
  // auto-scroll effect only fires when true, so scrolling up to read an
  // earlier message isn't yanked back down while a reply streams in.
  const atBottomRef = useRef(true);
  const isBusy = status === "submitted" || status === "streaming";

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !atBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    sendMessage({ text: trimmed });
    setInput("");
  }

  async function handleForward(question: string) {
    try {
      const res = await fetch("/api/forward-question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, question }),
      });
      setForwardToast(res.ok ? "Question forwarded to Alexandre." : "Couldn't forward — try again.");
    } catch {
      setForwardToast("Couldn't forward — try again.");
    }
    setTimeout(() => setForwardToast(null), 3000);
  }

  function messageText(m: (typeof messages)[number]): string {
    return m.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("");
  }

  useEffect(() => {
    const assistantTexts = messages
      .filter((m) => m.role !== "user")
      .map((m) => messageText(m));
    setCitedPaths(extractCitedPaths(assistantTexts));
  }, [messages, setCitedPaths]);

  return (
    <section className="relative flex h-full flex-col overflow-hidden bg-[var(--color-card)]/20">
      <span
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 h-[260px] w-[420px] -translate-x-1/2 rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(var(--color-accent-rgb),0.10) 0%, transparent 70%)",
          filter: "blur(20px)",
        }}
      />

      <header className="flex h-11 shrink-0 items-center justify-between border-b border-[var(--color-border)] px-5">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className={cn(
              "relative inline-flex h-2 w-2 rounded-full",
              isBusy ? "bg-[var(--color-accent)]" : "bg-[var(--color-primary)]",
            )}
          >
            {isBusy && (
              <span className="absolute inset-0 animate-ping rounded-full bg-[var(--color-accent)] opacity-60" />
            )}
          </span>
          <span
            className="font-mono text-[10px] uppercase text-[var(--color-text-secondary)]"
            style={{ letterSpacing: "0.3em" }}
          >
            {isBusy ? "thinking" : "ready"}
          </span>
        </div>
        <span
          className="font-mono text-[10px] uppercase text-[var(--color-text-tertiary)]"
          style={{ letterSpacing: "0.3em" }}
        >
          /chat
        </span>
      </header>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="chat-scroll flex-1 overflow-y-auto px-5 py-6 sm:px-6"
      >
        <div className="fade-up mx-auto flex w-full max-w-3xl flex-col gap-4" style={{ animationDelay: "0.15s" }}>
          <ChatMessage role="assistant" text={intro} />
          {messages.map((m, i) => {
            const isLastMessage = i === messages.length - 1;
            const isStreaming = status === "streaming" && isLastMessage && m.role !== "user";
            return (
              <StreamingMessage
                key={m.id}
                role={m.role === "user" ? "user" : "assistant"}
                text={messageText(m)}
                isStreaming={isStreaming}
                onForward={handleForward}
                onOpenArtifact={openFile}
              />
            );
          })}

          {messages.length === 0 && (
            <div className="mt-3 flex flex-col gap-3">
              <p
                className="font-mono text-[10px] uppercase text-[var(--color-text-tertiary)]"
                style={{ letterSpacing: "0.3em" }}
              >
                {startersTitle}
              </p>
              <div className="flex flex-wrap gap-2">
                {starters.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => submit(s)}
                    disabled={isBusy}
                    className={cn(
                      "group rounded-full border border-[var(--color-border)] bg-[var(--color-card)] px-3.5 py-1.5 text-[12px] text-[var(--color-text-secondary)]",
                      "transition-all duration-200",
                      "hover:border-[var(--color-primary)] hover:text-[var(--color-text-primary)]",
                      "disabled:cursor-not-allowed disabled:opacity-50",
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {forwardToast && (
        <div
          role="status"
          className="mx-auto mb-3 w-full max-w-3xl rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]/60 px-3 py-2 text-xs text-[var(--color-text-secondary)]"
        >
          {forwardToast}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="mx-auto mb-3 w-full max-w-3xl rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300"
        >
          Something went wrong — please try again.
        </div>
      )}

      <form
        className="border-t border-[var(--color-border)] bg-[var(--color-surface)]"
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
      >
        <div className="mx-auto flex w-full max-w-3xl items-end gap-2 px-4 py-3 sm:px-5">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={placeholder}
            rows={1}
            className="min-h-[42px] resize-none border-transparent bg-transparent text-[14px] focus-visible:border-transparent focus-visible:ring-0"
            disabled={isBusy}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(input);
              }
            }}
          />
          <Button type="submit" disabled={isBusy || !input.trim()} className="shrink-0">
            {sendLabel}
          </Button>
        </div>
      </form>
    </section>
  );
}
