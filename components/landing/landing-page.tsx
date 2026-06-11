import { GridBackground } from "@/components/grid-background";
import { InterviewDemo } from "@/components/landing/interview-demo";
import { McpTerminal } from "@/components/landing/mcp-terminal";
import { REPO_URL } from "@/lib/repo";

/**
 * Marketing landing page served at `/`. Demos the product rather than
 * describing it: a scripted interview replay (chat + citations + mini KB
 * panel), a typing MCP terminal, and the public content-repo tree. Static
 * server component; the client islands are the dot grid, the interview
 * replay, and the terminal. Shares the app's Arctic design tokens so it
 * reads as part of the product.
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

const MONO_LABEL = "font-mono text-[10px] uppercase text-[var(--color-text-tertiary)]";

/** The public content-repo tree, annotated. Rendered as styled mono text. */
function RepoTree() {
  const dim = "text-[var(--color-text-tertiary)]";
  const file = "text-[var(--color-text-secondary)]";
  const note = "text-[var(--color-accent)]";
  return (
    <pre className="overflow-x-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-void)]/70 p-5 font-mono text-[12px] leading-[1.9] backdrop-blur-sm sm:text-[12.5px]">
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
    <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-void)]/70 shadow-[0_24px_80px_-24px_rgba(0,0,0,0.55)] backdrop-blur-sm">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-2.5">
        <span
          className="font-mono text-[10px] uppercase text-[var(--color-text-tertiary)]"
          style={{ letterSpacing: "0.22em" }}
        >
          your dns · one record
        </span>
        <span className="inline-flex items-center gap-1.5 font-mono text-[9px] uppercase text-[var(--color-accent)]" style={{ letterSpacing: "0.18em" }}>
          <span
            aria-hidden
            className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]"
            style={{ boxShadow: "0 0 8px 1px rgba(var(--color-accent-rgb),0.7)" }}
          />
          verified
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-4 font-mono text-[12px] sm:text-[12.5px]">
        <span className="rounded-md border border-[var(--color-border)] bg-[var(--color-card)]/60 px-2 py-0.5 text-[var(--color-text-secondary)]">
          CNAME
        </span>
        <span className="text-[var(--color-text-primary)]">cv.yourname.com</span>
        <span aria-hidden className="text-[var(--color-text-tertiary)]">
          →
        </span>
        <span className="text-[var(--color-text-secondary)]">cname.vercel-dns.com</span>
      </div>
      <div className="border-t border-[var(--color-border)] px-4 py-4">
        <div className="flex items-center gap-2.5 rounded-full border border-[var(--color-border)] bg-[var(--color-card)]/60 px-4 py-2.5">
          <svg
            viewBox="0 0 16 16"
            width="12"
            height="12"
            fill="currentColor"
            aria-hidden
            className="shrink-0 text-[var(--color-accent)]"
          >
            <path d="M8 1a3.5 3.5 0 00-3.5 3.5V6H4a1.5 1.5 0 00-1.5 1.5v5A1.5 1.5 0 004 14h8a1.5 1.5 0 001.5-1.5v-5A1.5 1.5 0 0012 6h-.5V4.5A3.5 3.5 0 008 1zm2 5H6V4.5a2 2 0 114 0V6z" />
          </svg>
          <span className="truncate font-mono text-[12.5px] text-[var(--color-text-primary)]">
            https://cv.yourname.com
          </span>
          <span
            className="ml-auto hidden shrink-0 font-mono text-[9px] uppercase text-[var(--color-text-tertiary)] sm:inline"
            style={{ letterSpacing: "0.18em" }}
          >
            your page · your cv
          </span>
        </div>
      </div>
    </div>
  );
}

export function LandingPage({ seeItLiveUsername }: Props) {
  return (
    <main className="relative min-h-dvh overflow-hidden bg-[var(--color-void)] text-[var(--color-text-primary)]">
      <GridBackground />

      {/* Atmospheric hero glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[14%] -z-0 h-[520px] w-[760px] -translate-x-1/2"
        style={{
          background:
            "radial-gradient(closest-side, rgba(var(--color-accent-rgb),0.16), transparent 72%)",
          animation: "heroGlow 9s ease-in-out infinite",
        }}
      />

      <div className="relative z-10 mx-auto flex min-h-dvh max-w-5xl flex-col px-6 sm:px-8">
        {/* Top bar */}
        <header className="flex items-center justify-between py-6">
          <span className="flex items-center gap-2 font-mono text-sm tracking-tight text-[var(--color-text-primary)]">
            <span
              aria-hidden
              className="inline-block h-2 w-2 rounded-full bg-[var(--color-accent)]"
              style={{ boxShadow: "0 0 10px 1px rgba(var(--color-accent-rgb),0.7)" }}
            />
            queritae
          </span>
          <a
            href="/api/auth/github/login"
            className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-card)]/60 px-3.5 py-1.5 text-[13px] text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-border-hover)] hover:text-[var(--color-text-primary)]"
          >
            <GitHubMark />
            Sign in with GitHub
          </a>
        </header>

        {/* Hero */}
        <section className="flex flex-col items-center pb-16 pt-8 text-center sm:pt-10">
          <p
            className={`fade-up ${MONO_LABEL}`}
            style={{ letterSpacing: "0.42em", animationDelay: "0.05s" }}
          >
            queryable cv · interview the agent
          </p>

          <h1
            className="fade-up mt-5 max-w-3xl font-display text-4xl font-light leading-[1.05] tracking-[-0.02em] text-[var(--color-text-primary)] sm:text-6xl"
            style={{ animationDelay: "0.12s" }}
          >
            A résumé you can{" "}
            <span className="font-serif font-normal italic text-[var(--color-accent)]">
              interview
            </span>
            .
          </h1>

          <p
            className="fade-up mt-5 max-w-xl text-[15px] leading-relaxed text-[var(--color-text-secondary)] sm:text-base"
            style={{ animationDelay: "0.2s" }}
          >
            Your experience lives as plain files in a GitHub repo you own. queritae
            turns it into a grounded agent — and an MCP endpoint — that answers a
            recruiter&apos;s questions and cites the exact file behind every claim.
          </p>

          {/* CTAs */}
          <div
            className="fade-up mt-8 flex flex-col items-center gap-3 sm:flex-row"
            style={{ animationDelay: "0.28s" }}
          >
            {seeItLiveUsername && (
              <a
                href={`/${seeItLiveUsername}`}
                className="group inline-flex items-center gap-2 rounded-full bg-[var(--color-primary)] px-5 py-2.5 text-[14px] font-medium text-white transition-all duration-200 hover:brightness-110"
                style={{ boxShadow: "0 8px 30px -8px rgba(var(--color-primary-rgb),0.6)" }}
              >
                See it live
                <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5">
                  →
                </span>
              </a>
            )}
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] px-5 py-2.5 text-[14px] text-[var(--color-text-secondary)] transition-colors duration-200 hover:border-[var(--color-border-hover)] hover:text-[var(--color-text-primary)]"
            >
              <GitHubMark />
              How it&apos;s built
            </a>
          </div>

          {/* The product, demoing itself */}
          <div className="fade-up mt-8 w-full max-w-3xl" style={{ animationDelay: "0.36s" }}>
            <InterviewDemo />
          </div>
        </section>

        {/* How it works */}
        <section className="border-t border-[var(--color-border)] py-14">
          <p className={MONO_LABEL} style={{ letterSpacing: "0.3em" }}>
            how it works
          </p>
          <div className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-border)] sm:grid-cols-3">
            {STEPS.map((s) => (
              <div
                key={s.n}
                className="group bg-[var(--color-surface)] p-6 transition-colors hover:bg-[var(--color-card)]"
              >
                <span
                  className="font-mono text-2xl font-light text-[var(--color-accent)] transition-all group-hover:[text-shadow:0_0_14px_rgba(var(--color-accent-rgb),0.7)]"
                  style={{ letterSpacing: "-0.02em" }}
                >
                  {s.n}
                </span>
                <h3 className="mt-3 font-display text-lg font-medium text-[var(--color-text-primary)]">
                  {s.title}
                </h3>
                <p className="mt-2 text-[14px] leading-relaxed text-[var(--color-text-secondary)]">
                  {s.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* MCP — agent-native */}
        <section className="border-t border-[var(--color-border)] py-14">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div>
              <p className={MONO_LABEL} style={{ letterSpacing: "0.3em" }}>
                agent-native
              </p>
              <h2 className="mt-4 font-display text-2xl font-light tracking-[-0.01em] text-[var(--color-text-primary)] sm:text-3xl">
                Their AI can{" "}
                <span className="font-serif font-normal italic text-[var(--color-accent)]">
                  interview
                </span>{" "}
                yours.
              </h2>
              <p className="mt-4 max-w-md text-[15px] leading-relaxed text-[var(--color-text-secondary)]">
                Recruiters increasingly read CVs through agents, not eyes. Every
                queritae account ships a first-class MCP server — point Claude,
                Cursor, or any MCP client at the endpoint and it gets the same
                grounded answers, with the same citations.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {["tool: ask", "tool: forward_question", "no credentials", "rate-limited"].map(
                  (chip) => (
                    <span
                      key={chip}
                      className="rounded-full border border-[var(--color-border)] bg-[var(--color-card)]/40 px-3 py-1 font-mono text-[11px] text-[var(--color-text-secondary)]"
                    >
                      {chip}
                    </span>
                  ),
                )}
              </div>
            </div>
            <McpTerminal />
          </div>
        </section>

        {/* Custom domains */}
        <section className="border-t border-[var(--color-border)] py-14">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div className="order-2 lg:order-1">
              <DomainCard />
            </div>
            <div className="order-1 lg:order-2">
              <p className={MONO_LABEL} style={{ letterSpacing: "0.3em" }}>
                your domain
              </p>
              <h2 className="mt-4 font-display text-2xl font-light tracking-[-0.01em] text-[var(--color-text-primary)] sm:text-3xl">
                Served from{" "}
                <span className="font-serif font-normal italic text-[var(--color-accent)]">
                  your
                </span>{" "}
                address.
              </h2>
              <p className="mt-4 max-w-md text-[15px] leading-relaxed text-[var(--color-text-secondary)]">
                Your page and printable CV don&apos;t have to live on ours — host
                them at cv.yourname.com. Add the domain in your admin, create one
                CNAME record, and verification and TLS happen automatically.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {["one CNAME record", "auto TLS", "up to 3 domains"].map((chip) => (
                  <span
                    key={chip}
                    className="rounded-full border border-[var(--color-border)] bg-[var(--color-card)]/40 px-3 py-1 font-mono text-[11px] text-[var(--color-text-secondary)]"
                  >
                    {chip}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Transparency */}
        <section className="border-t border-[var(--color-border)] py-14">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div className="order-2 lg:order-1">
              <RepoTree />
            </div>
            <div className="order-1 lg:order-2">
              <p className={MONO_LABEL} style={{ letterSpacing: "0.3em" }}>
                nothing hidden
              </p>
              <h2 className="mt-4 font-display text-2xl font-light tracking-[-0.01em] text-[var(--color-text-primary)] sm:text-3xl">
                The whole act is{" "}
                <span className="font-serif font-normal italic text-[var(--color-accent)]">
                  auditable
                </span>
                .
              </h2>
              <p className="mt-4 max-w-md text-[15px] leading-relaxed text-[var(--color-text-secondary)]">
                The agent&apos;s entire world is a public repo: structured facts,
                narrative stories, and the system prompt itself. Edit, commit,
                re-sync — the version history is the paper trail.
              </p>
            </div>
          </div>

          <div className="mt-12 grid gap-10 sm:grid-cols-3">
            {VALUES.map((v) => (
              <div key={v.title}>
                <div
                  aria-hidden
                  className="mb-3 h-px w-8 bg-[var(--color-accent)]"
                  style={{ boxShadow: "0 0 8px 0 rgba(var(--color-accent-rgb),0.6)" }}
                />
                <h3 className="font-display text-base font-medium text-[var(--color-text-primary)]">
                  {v.title}
                </h3>
                <p className="mt-2 text-[14px] leading-relaxed text-[var(--color-text-secondary)]">
                  {v.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Final CTA */}
        <section className="border-t border-[var(--color-border)] py-16 text-center">
          <h2 className="mx-auto max-w-2xl font-display text-3xl font-light leading-tight tracking-[-0.02em] text-[var(--color-text-primary)] sm:text-4xl">
            Put your career{" "}
            <span className="font-serif font-normal italic text-[var(--color-accent)]">
              on the record
            </span>
            .
          </h2>
          <p className="mx-auto mt-4 max-w-md text-[14px] leading-relaxed text-[var(--color-text-secondary)]">
            Create an account with GitHub and point it at a content repo. New
            accounts are reviewed by hand — your page goes public as soon as
            it&apos;s approved.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href="/api/auth/github/login"
              className="group inline-flex items-center gap-2 rounded-full bg-[var(--color-primary)] px-5 py-2.5 text-[14px] font-medium text-white transition-all duration-200 hover:brightness-110"
              style={{ boxShadow: "0 8px 30px -8px rgba(var(--color-primary-rgb),0.6)" }}
            >
              <GitHubMark />
              Create yours with GitHub
            </a>
            {seeItLiveUsername && (
              <a
                href={`/${seeItLiveUsername}`}
                className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] px-5 py-2.5 text-[14px] text-[var(--color-text-secondary)] transition-colors duration-200 hover:border-[var(--color-border-hover)] hover:text-[var(--color-text-primary)]"
              >
                Interview the live agent →
              </a>
            )}
          </div>
        </section>

        {/* Footer */}
        <footer className="flex flex-col items-center justify-between gap-3 border-t border-[var(--color-border)] py-8 sm:flex-row">
          <span className={MONO_LABEL} style={{ letterSpacing: "0.22em" }}>
            queritae — an open, queryable cv
          </span>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[10px] uppercase text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-text-secondary)]"
            style={{ letterSpacing: "0.22em" }}
          >
            source on github →
          </a>
        </footer>
      </div>
    </main>
  );
}
