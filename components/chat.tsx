"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ChatMessage } from "@/components/chat-message";
import { StreamingMessage } from "@/components/streaming-message";
import { IdentifyModal } from "@/components/identify-modal";
import { cn } from "@/lib/utils";

export type ChatProps = {
  repoUrl: string;
  branch: string;
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
  repoUrl,
  branch,
  intro,
  placeholder,
  sendLabel,
  startersTitle,
  starters,
}: ChatProps) {
  const [conversationId, setConversationId] = useState("");
  const conversationIdRef = useRef("");
  useEffect(() => {
    const id = loadOrCreateConversationId();
    conversationIdRef.current = id;
    setConversationId(id);
  }, []);
  const [modalOpen, setModalOpen] = useState(false);
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
  const isBusy = status === "submitted" || status === "streaming";

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

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

  return (
    <section
      className="fade-up relative flex h-[68vh] min-h-[480px] flex-col overflow-hidden rounded-[20px] border border-[var(--color-border)] bg-[var(--color-card)]/70 backdrop-blur-md"
      style={{ animationDelay: "0.25s" }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 h-[260px] w-[260px] -translate-x-1/2 rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(var(--color-accent-rgb),0.10) 0%, transparent 70%)",
          filter: "blur(20px)",
        }}
      />

      <header className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-3">
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

      <div ref={scrollRef} className="chat-scroll flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-5 sm:px-6">
        <ChatMessage role="assistant" text={intro} repoUrl={repoUrl} branch={branch} />
        {messages.map((m, i) => {
          const isLastMessage = i === messages.length - 1;
          const isStreaming = status === "streaming" && isLastMessage && m.role !== "user";
          return (
            <StreamingMessage
              key={m.id}
              role={m.role === "user" ? "user" : "assistant"}
              text={messageText(m)}
              isStreaming={isStreaming}
              repoUrl={repoUrl}
              branch={branch}
              onIdentify={() => setModalOpen(true)}
              onForward={handleForward}
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
                    "group rounded-full border border-[var(--color-border)] px-3.5 py-1.5 text-[12px] text-[var(--color-text-secondary)]",
                    "transition-all duration-200",
                    "hover:border-[var(--color-primary)] hover:text-[var(--color-text-primary)]",
                    "hover:bg-[rgba(var(--color-primary-rgb),0.10)]",
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

      {forwardToast && (
        <div
          role="status"
          className="mx-5 mb-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]/60 px-3 py-2 text-xs text-[var(--color-text-secondary)]"
        >
          {forwardToast}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="mx-5 mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300"
        >
          Something went wrong — please try again.
        </div>
      )}

      <form
        className="flex items-end gap-2 border-t border-[var(--color-border)] bg-[var(--color-surface)]/40 px-4 py-3 sm:px-5"
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
      >
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
      </form>

      <IdentifyModal
        conversationId={conversationId}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={() => setModalOpen(false)}
      />
    </section>
  );
}
