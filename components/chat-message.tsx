"use client";

import { useState } from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { rewriteCitations } from "@/lib/kb/cited-paths";
import { splitOnMarkers } from "@/lib/markers";
import { cn } from "@/lib/utils";

const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), "sup"],
  protocols: {
    ...defaultSchema.protocols,
    href: [...(defaultSchema.protocols?.href ?? []), "kb"],
  },
  attributes: {
    ...defaultSchema.attributes,
    a: [...((defaultSchema.attributes?.a as unknown[]) ?? []), ["target"], ["rel"]],
  },
};

// `react-markdown`'s default URL transform drops unknown protocols, which would
// strip our internal `kb://` citation links before they reach the `a`
// renderer. Pass `kb://` URLs through untouched; sanitize everything else.
function urlTransform(url: string): string {
  return url.startsWith("kb://") ? url : defaultUrlTransform(url);
}

export type ChatMessageProps = {
  role: "user" | "assistant";
  text: string;
  /** DOM id anchor (`msg-<id>`) so the KB tree's chips can scroll here. */
  id?: string;
  /** Localized label for the assistant role tag. */
  agentLabel: string;
  /** Localized label for the inline "forward to Alexandre" button. */
  forwardLabel: string;
  /**
   * Localized strings for the contact-collection modal. When provided, the
   * forward button opens a modal that lets the visitor optionally leave a
   * contact before submitting. When omitted, clicking forward submits
   * immediately with an empty contact (legacy direct-call behavior).
   */
  forwardStrings?: {
    prompt: string;
    placeholder: string;
    send: string;
    cancel: string;
  };
  onForward?: (question: string, contact: string) => void;
  onOpenArtifact?: (path: string, anchor: string | null) => void;
  /** Conversation-global citation numbers keyed by `path` / `path#anchor`. */
  citationIndices?: Record<string, number>;
};

export function ChatMessage({
  role,
  text,
  id,
  agentLabel,
  forwardLabel,
  forwardStrings,
  onForward,
  onOpenArtifact,
  citationIndices,
}: ChatMessageProps) {
  const isAssistant = role === "assistant";
  const rendered = isAssistant ? rewriteCitations(text, citationIndices ?? {}) : text;
  const chunks = isAssistant ? splitOnMarkers(rendered) : [];
  const [pendingForward, setPendingForward] = useState<string | null>(null);
  const [contact, setContact] = useState("");

  return (
    <div
      id={id}
      className={cn(
        "flex w-full",
        isAssistant ? "justify-start" : "justify-end",
      )}
    >
      <div
        className={cn(
          "relative max-w-[85%] border px-4 py-3",
          // Opaque fills, so the dot grid behind the chat never shows through.
          isAssistant
            ? "border-[var(--color-border)] bg-[var(--color-void)]"
            : "border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-text-primary)]",
        )}
      >
        {isAssistant && (
          <span className="mb-2 flex items-center gap-1.5 font-heading text-2xs uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">
            <span aria-hidden className="text-[var(--color-brand)]">
              ✦
            </span>
            {agentLabel}
          </span>
        )}
        {isAssistant ? (
          <div className="prose-chat">
            {chunks.map((chunk, i) => {
              if (chunk.kind === "forward") {
                return (
                  <button
                    key={`forward-${i}`}
                    type="button"
                    onClick={() => {
                      if (forwardStrings) {
                        setContact("");
                        setPendingForward(chunk.question);
                      } else {
                        onForward?.(chunk.question, "");
                      }
                    }}
                    className="mt-2 mr-2 inline-flex border border-[var(--color-text-primary)]/70 px-3 py-1 font-heading text-2xs uppercase tracking-[0.12em] text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-text-primary)] hover:text-[var(--color-void)]"
                  >
                    {forwardLabel}
                  </button>
                );
              }
              if (chunk.value === "") return null;
              return (
                <ReactMarkdown
                  key={`text-${i}`}
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
                  urlTransform={urlTransform}
                  components={{
                    a: ({ href, children }) => {
                      if (href?.startsWith("kb://")) {
                        const target = href.slice("kb://".length);
                        const hash = target.indexOf("#");
                        const path = hash === -1 ? target : target.slice(0, hash);
                        const anchor = hash === -1 ? null : target.slice(hash + 1);
                        return (
                          <button
                            type="button"
                            onClick={() => onOpenArtifact?.(path, anchor)}
                            className="kb-citation"
                          >
                            {children}
                          </button>
                        );
                      }
                      return (
                        <a href={href} target="_blank" rel="noopener noreferrer">
                          {children}
                        </a>
                      );
                    },
                  }}
                >
                  {chunk.value}
                </ReactMarkdown>
              );
            })}
            {pendingForward !== null && forwardStrings && (
              <div
                role="dialog"
                aria-modal="true"
                className="mt-2 border border-[var(--color-border)] bg-[var(--color-card)] p-3"
              >
                <p className="mb-2 text-xs text-[var(--color-text-secondary)]">
                  {forwardStrings.prompt}
                </p>
                <input
                  type="text"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder={forwardStrings.placeholder}
                  className="mb-2 h-9 w-full border border-[var(--color-input)] bg-[var(--color-void)] px-3 text-sm outline-none focus-visible:border-[var(--color-ring)]"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setPendingForward(null)}
                    className="px-2 py-1 font-heading text-2xs uppercase tracking-[0.12em] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                  >
                    {forwardStrings.cancel}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onForward?.(pendingForward, contact);
                      setPendingForward(null);
                    }}
                    className="bg-[var(--color-text-primary)] px-3 py-1 font-heading text-2xs uppercase tracking-[0.12em] text-[var(--color-void)] hover:opacity-85"
                  >
                    {forwardStrings.send}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{text}</p>
        )}
      </div>
    </div>
  );
}
