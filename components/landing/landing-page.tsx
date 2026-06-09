import { GridBackground } from "@/components/grid-background";
import { REPO_URL } from "@/lib/repo";

/**
 * Marketing landing page served at `/`. Pitches the queritae concept and points
 * visitors at a live account. Static (server component) — the only client
 * island is the animated dot grid. Shares the app's Arctic design tokens so it
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
    body: "Send a recruiter a URL — or plug the built-in MCP endpoint straight into their AI tools so they can query you directly.",
  },
];

const VALUES = [
  {
    title: "Nothing hidden",
    body: "The knowledge base and the system prompt are public and auditable. No puffery, no black box.",
  },
  {
    title: "Knows who's asking",
    body: "When a recruiter introduces themselves, the agent recognizes the company and the role they're hiring for.",
  },
  {
    title: "Agent-native",
    body: "A first-class MCP server ships with every account, so other AI agents can interview you over the wire.",
  },
];

const SAMPLE_QUESTIONS = [
  "What have they actually shipped?",
  "Where do they go deepest?",
  "Are they a fit for a staff role?",
];

function GitHubMark() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" fill="currentColor" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

const MONO_LABEL = "font-mono text-[10px] uppercase text-[var(--color-text-tertiary)]";

export function LandingPage({ seeItLiveUsername }: Props) {
  return (
    <main className="relative min-h-dvh overflow-hidden bg-[var(--color-void)] text-[var(--color-text-primary)]">
      <GridBackground />

      {/* Atmospheric hero glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[18%] -z-0 h-[520px] w-[760px] -translate-x-1/2"
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
        <section className="flex flex-1 flex-col items-center justify-center py-12 text-center sm:py-16">
          <p
            className={`fade-up ${MONO_LABEL}`}
            style={{ letterSpacing: "0.42em", animationDelay: "0.05s" }}
          >
            queryable cv · interview the agent
          </p>

          <h1
            className="fade-up mt-6 max-w-3xl font-display text-4xl font-light leading-[1.05] tracking-[-0.02em] text-[var(--color-text-primary)] sm:text-6xl"
            style={{ animationDelay: "0.12s" }}
          >
            A résumé you can{" "}
            <span className="font-serif font-normal italic text-[var(--color-accent)]">
              talk to
            </span>
            .
          </h1>

          <p
            className="fade-up mt-6 max-w-xl text-[15px] leading-relaxed text-[var(--color-text-secondary)] sm:text-base"
            style={{ animationDelay: "0.2s" }}
          >
            queritae turns a public GitHub repo of your experience into a grounded
            chat agent — and an MCP endpoint — that answers a recruiter&apos;s
            questions, cites its sources, and hides nothing.
          </p>

          {/* Faux query bar — the product preview */}
          <div
            className="fade-up mt-10 w-full max-w-xl"
            style={{ animationDelay: "0.28s" }}
          >
            <div className="flex items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)]/70 px-4 py-3.5 text-left shadow-[0_8px_40px_-12px_rgba(0,0,0,0.5)] backdrop-blur-sm">
              <span
                aria-hidden
                className="h-2 w-2 shrink-0 rounded-full bg-[var(--color-primary)]"
              />
              <span className="caret-blink flex-1 truncate text-[15px] text-[var(--color-text-secondary)]">
                Ask about their work on…
              </span>
              <span
                className="shrink-0 font-mono text-[10px] uppercase text-[var(--color-text-tertiary)]"
                style={{ letterSpacing: "0.28em" }}
              >
                /chat
              </span>
            </div>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {SAMPLE_QUESTIONS.map((q) => (
                <span
                  key={q}
                  className="rounded-full border border-[var(--color-border)] bg-[var(--color-card)]/40 px-3 py-1 text-[12px] text-[var(--color-text-secondary)]"
                >
                  {q}
                </span>
              ))}
            </div>
          </div>

          {/* CTAs */}
          <div
            className="fade-up mt-10 flex flex-col items-center gap-3 sm:flex-row"
            style={{ animationDelay: "0.36s" }}
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
        </section>

        {/* How it works */}
        <section className="border-t border-[var(--color-border)] py-14">
          <p className={MONO_LABEL} style={{ letterSpacing: "0.3em" }}>
            how it works
          </p>
          <div className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-border)] sm:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="bg-[var(--color-surface)] p-6">
                <span
                  className="font-mono text-2xl font-light text-[var(--color-accent)]"
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

        {/* Why */}
        <section className="border-t border-[var(--color-border)] py-14">
          <div className="grid gap-10 sm:grid-cols-3">
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
