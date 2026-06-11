"use client";

import { useState } from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { parseCitations } from "@/lib/kb/citations";
import { citedRefKey } from "@/lib/kb/cited-paths";
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

function rewriteCitations(text: string, indices: Record<string, number>): string {
  const cites = parseCitations(text);
  let fallback = 0;
  let out = text;
  for (const c of cites) {
    fallback += 1;
    const target = citedRefKey(c.path, c.anchor);
    const n = indices[target] ?? fallback;
    // `kb://<path>[#anchor]` is an internal sentinel — the `a` renderer below
    // turns it into a button that opens the file (and section) in the KB panel.
    const replacement = `<sup>[\\[${n}\\]](kb://${target})</sup>`;
    out = out.replace(c.token, replacement);
  }
  return out;
}

export function ChatMessage({
  role,
  text,
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
      className={cn(
        "flex w-full",
        isAssistant ? "justify-start" : "justify-end",
      )}
    >
      <div
        className={cn(
          "relative max-w-[85%] rounded-2xl px-4 py-3",
          isAssistant
            ? "border border-[var(--color-border)] bg-[var(--color-card)]"
            : "bg-[var(--color-card)] text-[var(--color-text-primary)] ring-1 ring-[rgba(var(--color-accent-rgb),0.25)]",
        )}
        // Opaque `--color-card` fill with a flat tint painted on top, so the
        // dot-grid background never shows through the bubble.
        style={{
          backgroundImage: isAssistant
            ? "linear-gradient(rgba(var(--color-primary-rgb),0.06), rgba(var(--color-primary-rgb),0.06))"
            : "linear-gradient(rgba(var(--color-accent-rgb),0.12), rgba(var(--color-accent-rgb),0.12))",
        }}
      >
        {isAssistant && (
          <span
            className="mb-1 block font-mono text-[9px] uppercase text-[var(--color-primary)]"
            style={{ letterSpacing: "0.32em" }}
          >
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
                    className="mt-2 mr-2 inline-flex rounded-full border border-[var(--color-border)] px-3 py-1 text-xs text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-text-primary)] hover:bg-[rgba(var(--color-primary-rgb),0.10)]"
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
                className="mt-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
              >
                <p className="mb-2 text-xs text-[var(--color-text-secondary)]">
                  {forwardStrings.prompt}
                </p>
                <input
                  type="text"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder={forwardStrings.placeholder}
                  className="mb-2 w-full rounded border border-[var(--color-border)] bg-transparent px-2 py-1 text-sm"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setPendingForward(null)}
                    className="rounded px-2 py-1 text-xs text-[var(--color-text-tertiary)]"
                  >
                    {forwardStrings.cancel}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onForward?.(pendingForward, contact);
                      setPendingForward(null);
                    }}
                    className="rounded bg-[var(--color-primary)] px-3 py-1 text-xs text-[var(--color-on-primary)]"
                  >
                    {forwardStrings.send}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="whitespace-pre-wrap text-[14px] leading-relaxed">{text}</p>
        )}
      </div>
    </div>
  );
}
