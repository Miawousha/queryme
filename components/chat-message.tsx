import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { parseCitations, citationToUrl } from "@/lib/kb/citations";
import { cn } from "@/lib/utils";

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
    // Replace the first remaining occurrence of this token with a markdown link inside <sup> tags.
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
        "max-w-prose rounded-2xl px-4 py-3 text-sm leading-relaxed",
        isAssistant
          ? "self-start bg-[var(--color-muted)] text-[var(--color-foreground)]"
          : "self-end bg-[var(--color-accent)] text-[var(--color-accent-foreground)]",
      )}
    >
      {isAssistant ? (
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeRaw]}
          components={{
            a: ({ href, children }) => (
              <a href={href} target="_blank" rel="noopener noreferrer" className="underline">
                {children}
              </a>
            ),
          }}
        >
          {rendered}
        </ReactMarkdown>
      ) : (
        <p className="whitespace-pre-wrap">{text}</p>
      )}
    </div>
  );
}
