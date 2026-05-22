import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { parseCitations } from "@/lib/kb/citations";
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
  onForward?: (question: string) => void;
  onOpenArtifact?: (path: string) => void;
};

type MarkerChunk =
  | { kind: "text"; value: string }
  | { kind: "forward"; question: string };

function splitOnMarkers(text: string): MarkerChunk[] {
  const out: MarkerChunk[] = [];
  const re = /\[\[(forward:[^\]]+)\]\]/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push({ kind: "text", value: text.slice(last, idx) });
    out.push({ kind: "forward", question: m[1].slice("forward:".length).trim() });
    last = idx + m[0].length;
  }
  if (last < text.length) out.push({ kind: "text", value: text.slice(last) });
  return out;
}

function rewriteCitations(text: string): string {
  const cites = parseCitations(text);
  let i = 0;
  let out = text;
  for (const c of cites) {
    i += 1;
    // `kb://<path>` is an internal sentinel — the `a` renderer below turns it
    // into a button that opens the file in the KB panel.
    const replacement = `<sup>[\\[${i}\\]](kb://${c.path})</sup>`;
    out = out.replace(c.token, replacement);
  }
  return out;
}

export function ChatMessage({ role, text, onForward, onOpenArtifact }: ChatMessageProps) {
  const isAssistant = role === "assistant";
  const rendered = isAssistant ? rewriteCitations(text) : text;
  const chunks = isAssistant ? splitOnMarkers(rendered) : [];

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
            agent
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
                    onClick={() => onForward?.(chunk.question)}
                    className="mt-2 mr-2 inline-flex rounded-full border border-[var(--color-border)] px-3 py-1 text-xs text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-text-primary)] hover:bg-[rgba(var(--color-primary-rgb),0.10)]"
                  >
                    Send this question to Alexandre
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
                        const path = href.slice("kb://".length);
                        return (
                          <button
                            type="button"
                            onClick={() => onOpenArtifact?.(path)}
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
          </div>
        ) : (
          <p className="whitespace-pre-wrap text-[14px] leading-relaxed">{text}</p>
        )}
      </div>
    </div>
  );
}
