"use client";

import { useState } from "react";
import type { ForwardedQuestion } from "@/lib/db/schema";
import { Field } from "@/components/admin/ui";
import { LABEL } from "@/components/admin/ui";
import { fmt } from "@/lib/admin/format";
import { cn } from "@/lib/utils";

export function QuestionDetail({
  question,
  onOpenConversation,
  apiBasePath,
}: {
  question: ForwardedQuestion;
  onOpenConversation: (conversationId: string) => void;
  apiBasePath: string;
}) {
  const [draft, setDraft] = useState(question.reply ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(
    question.answeredAt ? new Date(question.answeredAt) : null,
  );

  async function submit() {
    if (!draft.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${apiBasePath}/questions/${question.id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reply: draft }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? `HTTP ${res.status}`);
      } else {
        setSavedAt(new Date());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {savedAt ? (
          <span
            className="rounded-full border border-[var(--color-border)] px-2 py-0.5 font-mono text-3xs uppercase text-[var(--color-text-secondary)]"
            style={{ letterSpacing: "0.16em" }}
          >
            answered
          </span>
        ) : (
          <span
            className="rounded-full border border-[var(--color-accent)] px-2 py-0.5 font-mono text-3xs uppercase text-[var(--color-accent)]"
            style={{ letterSpacing: "0.16em" }}
          >
            unanswered
          </span>
        )}
        <span className="ml-auto font-mono text-2xs text-[var(--color-text-tertiary)]">
          {fmt(question.createdAt)}
        </span>
      </div>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-text-primary)]">
        {question.question}
      </p>
      {question.contact && <Field label="Visitor contact" value={question.contact} />}
      <div className="flex flex-col gap-1">
        <span className={LABEL}>Reply</span>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={6}
          className="rounded-md border border-[var(--color-border)] bg-transparent p-2 text-control"
          placeholder="Write the reply you want to send…"
        />
        <div className="flex items-center justify-between">
          <span className="font-mono text-2xs text-[var(--color-text-tertiary)]">
            {question.contact ? "Will email the visitor on send." : "No contact — saved locally only."}
          </span>
          <button
            type="button"
            disabled={busy || !draft.trim()}
            onClick={submit}
            className={cn(
              "rounded-md border border-[var(--color-border)] px-3 py-1.5 font-mono text-2xs uppercase",
              "hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
            style={{ letterSpacing: "0.18em" }}
          >
            {busy ? "Sending…" : savedAt ? "Update reply" : "Send reply"}
          </button>
        </div>
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>
      {question.conversationId && (
        <button
          type="button"
          onClick={() => onOpenConversation(question.conversationId!)}
          className={cn(
            "self-start rounded-md border border-[var(--color-border)] px-3 py-1.5",
            "font-mono text-2xs uppercase text-[var(--color-text-secondary)] transition-colors",
            "hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]",
            "focus-visible:outline-none focus-visible:border-[var(--color-primary)]",
          )}
          style={{ letterSpacing: "0.18em" }}
        >
          Open conversation →
        </button>
      )}
    </div>
  );
}
