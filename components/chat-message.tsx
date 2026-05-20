import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { parseCitations, citationToUrl } from "@/lib/kb/citations";
import { cn } from "@/lib/utils";

const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), "sup"],
  attributes: {
    ...defaultSchema.attributes,
    a: [...((defaultSchema.attributes?.a as unknown[]) ?? []), ["target"], ["rel"]],
  },
};

export type ChatMessageProps = {
  role: "user" | "assistant";
  text: string;
  repoUrl: string;
  branch: string;
};

function rewriteCitations(text: string, repoUrl: string, branch: string): string {
  const cites = parseCitations(text);
  let i = 0;
  let out = text;
  for (const c of cites) {
    i += 1;
    const url = citationToUrl(c, { repoUrl, branch });
    const replacement = `<sup>[\\[${i}\\]](${url})</sup>`;
    out = out.replace(c.token, replacement);
  }
  return out;
}

export function ChatMessage({ role, text, repoUrl, branch }: ChatMessageProps) {
  const isAssistant = role === "assistant";
  const rendered = isAssistant ? rewriteCitations(text, repoUrl, branch) : text;

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
            ? "border border-[var(--color-border)] bg-[rgba(var(--color-primary-rgb),0.06)]"
            : "bg-[rgba(var(--color-accent-rgb),0.12)] text-[var(--color-text-primary)] ring-1 ring-[rgba(var(--color-accent-rgb),0.25)]",
        )}
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
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
              components={{
                a: ({ href, children }) => (
                  <a href={href} target="_blank" rel="noopener noreferrer">
                    {children}
                  </a>
                ),
              }}
            >
              {rendered}
            </ReactMarkdown>
          </div>
        ) : (
          <p className="whitespace-pre-wrap text-[14px] leading-relaxed">{text}</p>
        )}
      </div>
    </div>
  );
}
