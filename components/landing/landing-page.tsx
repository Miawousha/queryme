import { InterviewDemo } from "@/components/landing/interview-demo";
import { McpTerminal } from "@/components/landing/mcp-terminal";
import { MatriceLogo } from "@/components/matrice-logo";
import { buttonVariants } from "@/components/ui/button";
import { Eyebrow, HatchedFrame, LabelStrip, StatusTag, TITLE } from "@/components/ui/matrice";
import { REPO_URL } from "@/lib/repo";
import { cn } from "@/lib/utils";

/**
 * Marketing landing page served at `/`. Demos the product rather than
 * describing it: a scripted interview replay (chat + citations + mini KB
 * panel), a typing MCP terminal, and the public content-repo tree. Static
 * server component; the client islands are the interview replay and the
 * terminal.
 *
 * Set in Matrice's design language (matrice-website-v2): a bordered header
 * with the mark, a centred hero (eyebrow badge, uppercase mono headline with
 * one word in the brand), then the sections in a column between hatched
 * gutters, each headed by a "✦ LABEL // note" strip, with their figures on
 * the dot grid.
 */
type Props = {
  /** The featured/house account username, linked as "see it live". Null hides the link. */
  seeItLiveUsername: string | null;
};

const STEPS = [
  {
    n: "01",
    title: "Point it at a public repo",
    body: "Your knowledge base lives as YAML and Markdown in a GitHub repo you own — one file per role, project, and skill.",
  },
  {
    n: "02",
    title: "It becomes an agent",
    body: "queritae loads your KB into a grounded chat agent that answers questions and cites the exact files it drew from.",
  },
  {
    n: "03",
    title: "Share one link",
    body: "Send a recruiter a URL — on queritae or your own domain — or hand their AI tools the MCP endpoint so they can query you directly.",
  },
];

const VALUES = [
  {
    title: "Nothing hidden",
    body: "The knowledge base and the system prompt are public and auditable. Anyone can read exactly what the agent knows and how it's instructed.",
  },
  {
    title: "No puffery",
    body: "Every claim traces to a versioned file in your repo. If it isn't in the KB, the agent says so — and can forward the question to the human.",
  },
  {
    title: "Knows who's asking",
    body: "When a recruiter introduces themselves, the agent records the company and role — visibly, with a chip in the chat showing exactly what was captured.",
  },
];

function GitHubMark() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" fill="currentColor" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function ArrowRight() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden>
      <path
        d="M3 8h10M9 4l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="square"
      />
    </svg>
  );
}

/** A section title: the heading face, uppercase, one word picked out in the brand. */
function SectionTitle({
  before,
  highlight,
  after,
  as: Tag = "h2",
  className,
}: {
  before: string;
  highlight: string;
  after?: string;
  as?: "h1" | "h2";
  className?: string;
}) {
  return (
    <Tag className={cn(TITLE, "text-[var(--color-text-primary)]", className)}>
      {before} <span className="text-[var(--color-brand)]">{highlight}</span>
      {after}
    </Tag>
  );
}

/** The public content-repo tree, annotated. Rendered as styled mono text. */
function RepoTree() {
  const dim = "text-[var(--color-text-tertiary)]";
  const file = "text-[var(--color-text-secondary)]";
  const note = "text-[var(--color-brand)]";
  return (
    <div className="border border-[var(--color-border)] bg-[var(--color-void)]">
      <LabelStrip label="you/cv-content" note="public repo" className="px-4 py-3" />
      <pre className="overflow-x-auto p-5 font-mono text-xs leading-[1.9] sm:text-[12.5px]">
        <code>
          <span className="text-[var(--color-text-primary)]">you/cv-content</span>
          {"\n"}
          <span className={dim}>├── </span>
          <span className={file}>kb/</span>
          {"\n"}
          <span className={dim}>│   ├── </span>
          <span className={file}>profile.yaml</span>
          {"\n"}
          <span className={dim}>│   ├── </span>
          <span className={file}>skills.yaml</span>
          {"\n"}
          <span className={dim}>│   ├── </span>
          <span className={file}>experience/</span>
          <span className={note}>   ← one file per role</span>
          {"\n"}
          <span className={dim}>│   └── </span>
          <span className={file}>projects/</span>
          <span className={note}>     ← one file per project</span>
          {"\n"}
          <span className={dim}>└── </span>
          <span className={file}>prompts/</span>
          {"\n"}
          <span className={dim}>    └── </span>
          <span className={file}>system.md</span>
          <span className={note}>     ← the agent&apos;s instructions, public</span>
        </code>
      </pre>
    </div>
  );
}

/**
 * The custom-domain visual: the one CNAME record an owner creates, and the
 * address their page ends up served from. Mirrors the real admin flow
 * (lib/domains): add the domain, point a CNAME at the platform, TLS and
 * verification are automatic.
 */
function DomainCard() {
  return (
    <div className="border border-[var(--color-border)] bg-[var(--color-void)]">
      <LabelStrip
        label="your dns · one record"
        note={<StatusTag tone="brand">verified</StatusTag>}
        className="px-4 py-3"
      />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-4 font-mono text-xs sm:text-[12.5px]">
        <StatusTag tone="muted">CNAME</StatusTag>
        <span className="text-[var(--color-text-primary)]">cv.yourname.com</span>
        <span aria-hidden className="text-[var(--color-text-tertiary)]">
          →
        </span>
        <span className="text-[var(--color-text-secondary)]">cname.vercel-dns.com</span>
      </div>
      <div className="border-t border-[var(--color-border)] px-4 py-4">
        <div className="flex items-center gap-2.5 border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-2.5">
          <svg
            viewBox="0 0 16 16"
            width="12"
            height="12"
            fill="currentColor"
            aria-hidden
            className="shrink-0 text-[var(--color-brand)]"
          >
            <path d="M8 1a3.5 3.5 0 00-3.5 3.5V6H4a1.5 1.5 0 00-1.5 1.5v5A1.5 1.5 0 004 14h8a1.5 1.5 0 001.5-1.5v-5A1.5 1.5 0 0012 6h-.5V4.5A3.5 3.5 0 008 1zm2 5H6V4.5a2 2 0 114 0V6z" />
          </svg>
          <span className="truncate font-mono text-[12.5px] text-[var(--color-text-primary)]">
            https://cv.yourname.com
          </span>
          <span className="ml-auto hidden shrink-0 font-heading text-3xs uppercase tracking-[0.14em] text-[var(--color-text-tertiary)] sm:inline">
            your page · your cv
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * A section built around one figure, as v2's FigureSection: the label strip,
 * then the copy beside the figure, the figure on the dot grid.
 */
function FigureRow({
  id,
  label,
  count,
  eyebrow,
  title,
  chips,
  figure,
  figureFirst = false,
  children,
}: {
  id: string;
  label: string;
  count: string;
  eyebrow: string;
  title: React.ReactNode;
  chips?: string[];
  figure: React.ReactNode;
  figureFirst?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-16 border-b border-[var(--color-border)]">
      <LabelStrip label={label} note={count} className="px-4 py-5 sm:px-6 lg:px-10" />
      <div className="grid lg:grid-cols-2">
        <div
          className={cn(
            "flex flex-col justify-center px-4 py-14 sm:px-6 sm:py-20 lg:px-10",
            figureFirst && "lg:order-2",
          )}
        >
          <Eyebrow>{eyebrow}</Eyebrow>
          <div className="mt-4">{title}</div>
          <p className="mt-5 max-w-md text-[17px] leading-relaxed text-[var(--color-text-secondary)]">
            {children}
          </p>
          {chips && (
            <div className="mt-6 flex flex-wrap gap-2">
              {chips.map((chip) => (
                <StatusTag key={chip} tone="muted">
                  {chip}
                </StatusTag>
              ))}
            </div>
          )}
        </div>
        <div
          className={cn(
            "flex min-w-0 items-center justify-center border-t border-[var(--color-border)] bg-dots px-4 py-12 sm:px-8 lg:border-t-0",
            figureFirst ? "lg:order-1 lg:border-r" : "lg:border-l",
          )}
        >
          <div className="w-full max-w-xl">{figure}</div>
        </div>
      </div>
    </section>
  );
}

const SECTION_TITLE = "text-[clamp(1.6rem,3.4vw,2.5rem)] leading-[1.1]";

export function LandingPage({ seeItLiveUsername }: Props) {
  return (
    <div className="min-h-dvh bg-[var(--color-void)] text-[var(--color-text-primary)]">
      {/* Header */}
      <header className="border-b border-[var(--color-border)]">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-4 sm:px-6 lg:px-10">
          <a href="/" className="inline-flex items-center gap-2.5" aria-label="queritae, home">
            <MatriceLogo size={21} />
            <span className="font-heading text-[15px] font-bold uppercase leading-none tracking-[0.14em]">
              queritae
            </span>
          </a>
          <a
            href="/api/auth/github/login"
            className={buttonVariants({ variant: "frame", size: "cta" })}
          >
            <GitHubMark />
            <span className="hidden sm:inline">Sign in with GitHub</span>
            <span className="sm:hidden">Sign in</span>
          </a>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative isolate overflow-hidden border-b border-[var(--color-border)]">
          {/* The dot grid, faded out toward the edges. */}
          <div
            aria-hidden
            className="absolute inset-0 -z-10 bg-dots [mask-image:radial-gradient(ellipse_at_50%_35%,black,transparent_70%)]"
          />
          <div className="mx-auto flex w-full max-w-5xl flex-col items-center px-4 pb-16 pt-20 text-center sm:px-6 sm:pt-24">
            <div className="fade-up" style={{ animationDelay: "0.05s" }}>
              <Eyebrow>Queryable CV · interview the agent</Eyebrow>
            </div>

            <h1
              className={cn(
                TITLE,
                "fade-up mt-6 max-w-3xl text-[clamp(2.1rem,5.6vw,4.2rem)] leading-[1.02] tracking-[-0.035em]",
              )}
              style={{ animationDelay: "0.12s" }}
            >
              A résumé you can <span className="text-[var(--color-brand)]">interview</span>.
            </h1>

            <p
              className="fade-up mt-6 max-w-xl text-lg leading-relaxed text-[var(--color-text-secondary)]"
              style={{ animationDelay: "0.2s" }}
            >
              Your experience lives as plain files in a GitHub repo you own. queritae
              turns it into a grounded agent — and an MCP endpoint — that answers a
              recruiter&apos;s questions and cites the exact file behind every claim.
            </p>

            {/* CTAs */}
            <div
              className="fade-up mt-10 flex flex-wrap justify-center gap-3"
              style={{ animationDelay: "0.28s" }}
            >
              {seeItLiveUsername && (
                <a
                  href={`/${seeItLiveUsername}`}
                  className={buttonVariants({ variant: "default", size: "cta" })}
                >
                  See it live
                  <ArrowRight />
                </a>
              )}
              <a
                href={REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonVariants({ variant: "frame", size: "cta" })}
              >
                <GitHubMark />
                How it&apos;s built
              </a>
            </div>

            {/* The product, demoing itself */}
            <div className="fade-up mt-14 w-full max-w-3xl text-left" style={{ animationDelay: "0.36s" }}>
              <InterviewDemo />
            </div>
          </div>
        </section>

        <HatchedFrame className="border-x border-[var(--color-border)] lg:border-x-0">
          {/* How it works */}
          <section id="how" className="scroll-mt-16 border-b border-[var(--color-border)]">
            <LabelStrip label="How it works" note="03 steps" className="px-4 py-5 sm:px-6 lg:px-10" />
            <div className="border-b border-[var(--color-border)] px-4 py-14 sm:px-6 sm:py-20 lg:px-10">
              <Eyebrow>From repo to agent</Eyebrow>
              <p className="mt-6 max-w-3xl text-[clamp(1.4rem,2.6vw,1.9rem)] font-medium leading-[1.3] tracking-[-0.015em] text-balance">
                <span className="text-[var(--color-text-primary)]">Your career, as files you own.</span>{" "}
                <span className="text-[var(--color-text-secondary)]">
                  queritae reads them, answers from them, and shows which one it used.
                </span>
              </p>
            </div>
            <div className="grid divide-y divide-[var(--color-border)] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              {STEPS.map((s) => (
                <div
                  key={s.n}
                  className="group px-4 py-10 transition-colors hover:bg-[var(--color-card)] sm:px-6 lg:px-10"
                >
                  <span className="font-heading text-label uppercase tracking-[0.14em] text-[var(--color-brand)]">
                    {"// "}
                    {s.n}
                  </span>
                  <h3 className="mt-4 text-lg font-semibold leading-snug tracking-[0.01em] text-[var(--color-text-primary)]">
                    {s.title}
                  </h3>
                  <p className="mt-3 leading-relaxed text-[var(--color-text-secondary)]">{s.body}</p>
                </div>
              ))}
            </div>
          </section>

          {/* MCP — agent-native */}
          <FigureRow
            id="mcp"
            label="Agent-native"
            count="MCP"
            eyebrow="For their tools"
            title={<SectionTitle before="Their AI can" highlight="interview" after=" yours." className={SECTION_TITLE} />}
            chips={["tool: ask", "tool: forward_question", "no credentials", "rate-limited"]}
            figure={<McpTerminal />}
          >
            Recruiters increasingly read CVs through agents, not eyes. Every queritae
            account ships a first-class MCP server — point Claude, Cursor, or any MCP
            client at the endpoint and it gets the same grounded answers, with the
            same citations.
          </FigureRow>

          {/* Custom domains */}
          <FigureRow
            id="domains"
            label="Your domain"
            count="one CNAME"
            eyebrow="Custom domains"
            title={<SectionTitle before="Served from" highlight="your" after=" address." className={SECTION_TITLE} />}
            chips={["one CNAME record", "auto TLS", "up to 3 domains"]}
            figure={<DomainCard />}
            figureFirst
          >
            Your page and printable CV don&apos;t have to live on ours — host them at
            cv.yourname.com. Add the domain in your admin, create one CNAME record, and
            verification and TLS happen automatically.
          </FigureRow>

          {/* Transparency */}
          <FigureRow
            id="transparency"
            label="Nothing hidden"
            count="public repo"
            eyebrow="Auditable"
            title={<SectionTitle before="The whole act is" highlight="auditable" after="." className={SECTION_TITLE} />}
            figure={<RepoTree />}
          >
            The agent&apos;s entire world is a public repo: structured facts, narrative
            stories, and the system prompt itself. Edit, commit, re-sync — the version
            history is the paper trail.
          </FigureRow>

          {/* Values */}
          <section className="border-b border-[var(--color-border)]">
            <LabelStrip label="Principles" note="03" className="px-4 py-5 sm:px-6 lg:px-10" />
            <div className="grid divide-y divide-[var(--color-border)] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              {VALUES.map((v) => (
                <div key={v.title} className="px-4 py-10 sm:px-6 lg:px-10">
                  <span className="font-heading text-label text-[var(--color-brand)]" aria-hidden>
                    ✦
                  </span>
                  <h3 className="mt-4 text-lg font-semibold leading-snug tracking-[0.01em] text-[var(--color-text-primary)]">
                    {v.title}
                  </h3>
                  <p className="mt-3 leading-relaxed text-[var(--color-text-secondary)]">{v.body}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Final CTA — v2's contact band */}
          <section className="relative isolate overflow-hidden border-b border-[var(--color-border)]">
            <div
              aria-hidden
              className="absolute inset-0 -z-10 bg-dots [mask-image:radial-gradient(ellipse_at_85%_50%,black,transparent_65%)]"
            />
            <div className="flex max-w-xl flex-col gap-6 px-4 py-20 sm:px-6 sm:py-28 lg:px-10">
              <Eyebrow>Get started</Eyebrow>
              <SectionTitle
                before="Put your career"
                highlight="on the record"
                after="."
                className="text-[clamp(1.9rem,4.4vw,3.2rem)] leading-[1.05] tracking-[-0.03em]"
              />
              <p className="text-[17px] leading-relaxed text-[var(--color-text-secondary)]">
                Create an account with GitHub and point it at a content repo — your page
                is live the moment you sign in.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <a
                  href="/api/auth/github/login"
                  className={buttonVariants({ variant: "default", size: "cta" })}
                >
                  <GitHubMark />
                  Create yours with GitHub
                </a>
                {seeItLiveUsername && (
                  <a
                    href={`/${seeItLiveUsername}`}
                    className={buttonVariants({ variant: "frame", size: "cta" })}
                  >
                    Interview the live agent
                    <ArrowRight />
                  </a>
                )}
              </div>
            </div>
          </section>
        </HatchedFrame>
      </main>

      {/* Footer */}
      <footer className="mx-auto flex max-w-[1400px] flex-col items-start justify-between gap-4 px-4 py-10 sm:flex-row sm:items-center sm:px-6 lg:px-10">
        <span className="inline-flex items-center gap-2.5">
          <MatriceLogo size={16} />
          <span className="font-heading text-label uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">
            queritae — an open, queryable cv
          </span>
        </span>
        <a
          href={REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="font-heading text-label uppercase tracking-[0.14em] text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-brand)]"
        >
          source on github →
        </a>
      </footer>
    </div>
  );
}
