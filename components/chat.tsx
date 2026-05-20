"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ChatMessage } from "@/components/chat-message";
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

export function Chat({
  repoUrl,
  branch,
  intro,
  placeholder,
  sendLabel,
  startersTitle,
  starters,
}: ChatProps) {
  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/chat" }), []);
  const { messages, sendMessage, status, error } = useChat({ transport });

  const [input, setInput] = useState("");
  const isBusy = status === "submitted" || status === "streaming";

  function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    sendMessage({ text: trimmed });
    setInput("");
  }

  function messageText(m: (typeof messages)[number]): string {
    return m.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("");
  }

  return (
    <section className="flex h-[70vh] max-w-3xl flex-col gap-4 rounded-3xl border border-[var(--color-border)] bg-[var(--color-background)] p-6">
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto pr-1">
        <ChatMessage role="assistant" text={intro} repoUrl={repoUrl} branch={branch} />
        {messages.map((m) => (
          <ChatMessage
            key={m.id}
            role={m.role === "user" ? "user" : "assistant"}
            text={messageText(m)}
            repoUrl={repoUrl}
            branch={branch}
          />
        ))}

        {messages.length === 0 && (
          <div className="mt-2 flex flex-col gap-2">
            <p className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
              {startersTitle}
            </p>
            <div className="flex flex-wrap gap-2">
              {starters.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={cn(
                    "rounded-full border border-[var(--color-border)] bg-[var(--color-muted)]",
                    "px-3 py-1 text-xs text-[var(--color-foreground)] hover:bg-[var(--color-border)]",
                  )}
                  onClick={() => submit(s)}
                  disabled={isBusy}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
        >
          Something went wrong — please try again.
        </div>
      )}

      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
      >
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder}
          rows={2}
          className="resize-none"
          disabled={isBusy}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit(input);
            }
          }}
        />
        <Button type="submit" disabled={isBusy || !input.trim()}>
          {sendLabel}
        </Button>
      </form>
    </section>
  );
}
