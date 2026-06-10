"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Self-playing, scripted replay of the product for the landing page: a
 * recruiter interviews the agent, answers stream in with citations, and the
 * mini knowledge-base panel lights up as files are cited. Pure theater — no
 * API calls — and labeled as such; the question chips let the visitor drive
 * which exchange plays next.
 *
 * Respects `prefers-reduced-motion` (renders the finished conversation,
 * no timers) and only animates while on-screen and the tab is visible.
 */

type Segment = { text: string } | { cite: string };

type Exchange = {
  question: string;
  /** Short label for the "drive it yourself" chip row. */
  chip: string;
  /** Value the identify_interviewer tool "records" during this exchange. */
  identify?: string;
  answer: Segment[];
};

const SCRIPT: Exchange[] = [
  {
    question: "Hi — Sara from Northwind, hiring for a Staff Platform role.",
    chip: "Introduce yourself",
    identify: "Northwind · Staff Platform",
    answer: [
      {
        text: "Nice to meet you, Sara — noted the role. Ask me anything about the work; every claim links back to a file in the public knowledge base.",
      },
    ],
  },
  {
    question: "What have they actually shipped?",
    chip: "What have they shipped?",
    answer: [
      { text: "Three things first: a fleet-telemetry pipeline ingesting 1.2B points a day" },
      { cite: "kb/projects/telemetry-pipeline.md" },
      { text: ", the zero-downtime migration of GridScale billing off its monolith" },
      { cite: "kb/experience/gridscale.md" },
      { text: ", and an open-source schema validator used by ~400 repos" },
      { cite: "kb/projects/schema-validator.md" },
      { text: "." },
    ],
  },
  {
    question: "Where do they go deepest — and where don't they?",
    chip: "Where do they go deepest?",
    answer: [
      {
        text: "Deepest in distributed data systems — eight years across ingestion, storage, and query layers",
      },
      { cite: "kb/skills.yaml" },
      { text: ". And straight from the file: mobile isn't their depth" },
      { cite: "kb/profile.yaml" },
      { text: ". Nothing puffed up." },
    ],
  },
];

const KB_FILES = [
  "kb/profile.yaml",
  "kb/skills.yaml",
  "kb/experience/gridscale.md",
  "kb/projects/telemetry-pipeline.md",
  "kb/projects/schema-validator.md",
  "prompts/system.md",
];

type Phase = "typing" | "thinking" | "streaming" | "rest";

/** Streaming budget for an answer: one unit per character, one per citation. */
function answerUnits(ex: Exchange): number {
  return ex.answer.reduce((n, s) => n + ("text" in s ? s.text.length : 1), 0);
}

function CiteChip({ n }: { n: number }) {
  return (
    <sup className="cite-pop ml-0.5 font-mono text-[0.7em] text-[var(--color-accent)]">
      [{n}]
    </sup>
  );
}

/** The answer revealed up to `units`; citations pop in as they are reached. */
function PartialAnswer({ ex, units }: { ex: Exchange; units: number }) {
  const out: React.ReactNode[] = [];
  let budget = units;
  let citeN = 0;
  for (const [i, seg] of ex.answer.entries()) {
    if (budget <= 0) break;
    if ("text" in seg) {
      out.push(<span key={i}>{seg.text.slice(0, budget)}</span>);
      budget -= seg.text.length;
    } else {
      citeN += 1;
      out.push(<CiteChip key={i} n={citeN} />);
      budget -= 1;
    }
  }
  return <>{out}</>;
}

function ExchangeView({
  ex,
  qUnits,
  aUnits,
  state,
}: {
  ex: Exchange;
  qUnits: number;
  aUnits: number;
  state: Phase | "done";
}) {
  const answering = state === "streaming" || state === "rest" || state === "done";
  return (
    <>
      {/* Visitor bubble — mirrors the real chat's user styling. */}
      <div className="flex justify-end">
        <div
          className="max-w-[85%] rounded-2xl bg-[var(--color-card)] px-4 py-2.5 text-left text-[13.5px] leading-relaxed text-[var(--color-text-primary)] ring-1 ring-[rgba(var(--color-accent-rgb),0.25)]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(var(--color-accent-rgb),0.12), rgba(var(--color-accent-rgb),0.12))",
          }}
        >
          <span className={state === "typing" ? "caret-blink" : undefined}>
            {ex.question.slice(0, qUnits)}
          </span>
        </div>
      </div>

      {/* Tool call — the agent records who's asking. */}
      {answering && ex.identify && (
        <div className="cite-pop flex justify-start">
          <span
            className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(var(--color-accent-rgb),0.35)] bg-[rgba(var(--color-accent-rgb),0.07)] px-2.5 py-1 font-mono text-[10px] text-[var(--color-accent)]"
            style={{ letterSpacing: "0.04em" }}
          >
            <span aria-hidden>✓</span> identify_interviewer · {ex.identify}
          </span>
        </div>
      )}

      {state === "thinking" && (
        <div className="flex justify-start">
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-3">
            <span className="thinking-dots" aria-label="thinking">
              <span />
              <span />
              <span />
            </span>
          </div>
        </div>
      )}

      {answering && (
        <div className="flex justify-start">
          <div
            className="max-w-[85%] rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-2.5 text-left text-[13.5px] leading-relaxed text-[var(--color-text-primary)]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(var(--color-primary-rgb),0.06), rgba(var(--color-primary-rgb),0.06))",
            }}
          >
            <span
              className="mb-1 block font-mono text-[9px] uppercase text-[var(--color-primary)]"
              style={{ letterSpacing: "0.32em" }}
            >
              agent
            </span>
            <PartialAnswer ex={ex} units={aUnits} />
          </div>
        </div>
      )}
    </>
  );
}

export function InterviewDemo() {
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Exchanges already completed this cycle (indices into SCRIPT, in play order).
  const [history, setHistory] = useState<number[]>([]);
  const [exIdx, setExIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>("typing");
  const [progress, setProgress] = useState(0);

  const [reduce, setReduce] = useState(false);
  const [inView, setInView] = useState(false);
  const [docVisible, setDocVisible] = useState(true);
  const active = inView && docVisible;

  useEffect(() => {
    setReduce(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  }, []);

  // Animate only while the demo is actually being looked at.
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      threshold: 0.2,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const onVis = () => setDocVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // The replay state machine: each effect run schedules exactly one step.
  useEffect(() => {
    if (reduce || !active) return;
    const ex = SCRIPT[exIdx];
    let t: ReturnType<typeof setTimeout>;
    if (phase === "typing") {
      t =
        progress < ex.question.length
          ? setTimeout(() => setProgress((p) => p + 1), 26)
          : setTimeout(() => setPhase("thinking"), 350);
    } else if (phase === "thinking") {
      t = setTimeout(() => {
        setPhase("streaming");
        setProgress(0);
      }, 750);
    } else if (phase === "streaming") {
      const total = answerUnits(ex);
      t =
        progress < total
          ? setTimeout(() => setProgress((p) => Math.min(p + 3, total)), 30)
          : setTimeout(() => setPhase("rest"), 200);
    } else {
      t = setTimeout(
        () => {
          const next = (exIdx + 1) % SCRIPT.length;
          // Wrapping starts a fresh cycle with a cleared transcript.
          setHistory((h) => (next === 0 ? [] : [...h, exIdx]));
          setExIdx(next);
          setPhase("typing");
          setProgress(0);
        },
        exIdx === SCRIPT.length - 1 ? 3400 : 2200,
      );
    }
    return () => clearTimeout(t);
  }, [reduce, active, phase, progress, exIdx]);

  // Keep the newest message in view as it streams.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  });

  function jumpTo(i: number) {
    if (reduce) return;
    // Keep a finished answer on screen; a half-played one is replaced.
    setHistory((h) => (phase === "rest" ? [...h, exIdx] : h));
    setExIdx(i);
    setPhase("typing");
    setProgress(0);
  }

  const ex = SCRIPT[exIdx];

  // Files cited so far this cycle — completed exchanges plus whatever the
  // current answer has revealed. Drives the KB-panel highlights.
  const cited = useMemo(() => {
    const set = new Set<string>();
    for (const h of history) {
      for (const s of SCRIPT[h].answer) if ("cite" in s) set.add(s.cite);
    }
    if (phase === "streaming" || phase === "rest") {
      let budget = phase === "rest" ? Number.POSITIVE_INFINITY : progress;
      for (const s of SCRIPT[exIdx].answer) {
        if (budget <= 0) break;
        if ("text" in s) budget -= s.text.length;
        else {
          set.add(s.cite);
          budget -= 1;
        }
      }
    }
    return set;
  }, [history, phase, progress, exIdx]);

  return (
    <div ref={rootRef} className="w-full">
      {/* Product frame */}
      <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/80 shadow-[0_24px_80px_-24px_rgba(0,0,0,0.55)] backdrop-blur-sm">
        {/* Frame top bar */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-2.5">
          <span
            className="flex items-center gap-2 font-mono text-[10px] uppercase text-[var(--color-text-tertiary)]"
            style={{ letterSpacing: "0.22em" }}
          >
            <span
              aria-hidden
              className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]"
              style={{ boxShadow: "0 0 8px 1px rgba(var(--color-accent-rgb),0.7)" }}
            />
            interview replay · scripted demo
          </span>
          <span
            className="hidden font-mono text-[10px] text-[var(--color-text-tertiary)] sm:inline"
            style={{ letterSpacing: "0.12em" }}
          >
            queritae.com/you
          </span>
        </div>

        <div className="flex">
          {/* Chat pane */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div
              ref={scrollRef}
              className="chat-scroll flex h-[380px] flex-col gap-3 overflow-y-auto px-4 py-4 sm:h-[420px]"
              aria-label="Simulated interview with the agent"
            >
              {reduce ? (
                SCRIPT.map((s, i) => (
                  <ExchangeView
                    key={i}
                    ex={s}
                    qUnits={s.question.length}
                    aUnits={Number.POSITIVE_INFINITY}
                    state="done"
                  />
                ))
              ) : (
                <>
                  {history.map((h, i) => (
                    <ExchangeView
                      key={`${i}-${h}`}
                      ex={SCRIPT[h]}
                      qUnits={SCRIPT[h].question.length}
                      aUnits={Number.POSITIVE_INFINITY}
                      state="done"
                    />
                  ))}
                  <ExchangeView
                    ex={ex}
                    qUnits={phase === "typing" ? progress : ex.question.length}
                    aUnits={phase === "streaming" ? progress : Number.POSITIVE_INFINITY}
                    state={phase}
                  />
                </>
              )}
            </div>

            {/* Faux composer — advances the script. */}
            <button
              type="button"
              onClick={() => jumpTo((exIdx + 1) % SCRIPT.length)}
              className="group flex items-center gap-3 border-t border-[var(--color-border)] px-4 py-3 text-left transition-colors hover:bg-[rgba(var(--color-primary-rgb),0.06)]"
            >
              <span
                aria-hidden
                className="h-2 w-2 shrink-0 rounded-full bg-[var(--color-primary)]"
              />
              <span className="caret-blink flex-1 truncate text-[13px] text-[var(--color-text-secondary)]">
                Ask the next question…
              </span>
              <span
                className="shrink-0 font-mono text-[9px] uppercase text-[var(--color-text-tertiary)] transition-colors group-hover:text-[var(--color-text-secondary)]"
                style={{ letterSpacing: "0.28em" }}
              >
                play ↵
              </span>
            </button>
          </div>

          {/* Mini knowledge-base panel — files light up as they're cited. */}
          <aside className="hidden w-[230px] shrink-0 flex-col border-l border-[var(--color-border)] bg-[var(--color-void)]/40 md:flex">
            <div
              className="border-b border-[var(--color-border)] px-3.5 py-2.5 text-left font-mono text-[9px] uppercase text-[var(--color-text-tertiary)]"
              style={{ letterSpacing: "0.28em" }}
            >
              knowledge base
            </div>
            <ul className="flex-1 space-y-px overflow-y-auto p-1.5">
              {KB_FILES.map((path) => {
                const isCited = reduce || cited.has(path);
                return (
                  <li
                    key={path}
                    className={`flex items-center gap-2 rounded-lg px-2 py-1.5 font-mono text-[10.5px] transition-colors duration-300 ${
                      isCited
                        ? "bg-[rgba(var(--color-accent-rgb),0.08)] text-[var(--color-text-primary)]"
                        : "text-[var(--color-text-tertiary)]"
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`h-1 w-1 shrink-0 rounded-full transition-colors duration-300 ${
                        isCited ? "bg-[var(--color-accent)]" : "bg-[var(--color-border)]"
                      }`}
                      style={
                        isCited
                          ? { boxShadow: "0 0 6px 1px rgba(var(--color-accent-rgb),0.6)" }
                          : undefined
                      }
                    />
                    <span className="truncate">{path}</span>
                    {isCited && (
                      <span className="cite-pop ml-auto shrink-0 text-[9px] uppercase text-[var(--color-accent)]">
                        cited
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            <div
              className="border-t border-[var(--color-border)] px-3.5 py-2.5 text-left font-mono text-[9px] text-[var(--color-text-tertiary)]"
              style={{ letterSpacing: "0.08em" }}
            >
              every file public · synced from GitHub
            </div>
          </aside>
        </div>
      </div>

      {/* Drive it yourself */}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        {SCRIPT.map((s, i) => (
          <button
            key={s.chip}
            type="button"
            onClick={() => jumpTo(i)}
            className={`rounded-full border px-3 py-1 text-[12px] transition-colors ${
              !reduce && i === exIdx
                ? "border-[rgba(var(--color-accent-rgb),0.5)] bg-[rgba(var(--color-accent-rgb),0.08)] text-[var(--color-text-primary)]"
                : "border-[var(--color-border)] bg-[var(--color-card)]/40 text-[var(--color-text-secondary)] hover:border-[var(--color-border-hover)] hover:text-[var(--color-text-primary)]"
            }`}
          >
            {s.chip}
          </button>
        ))}
      </div>
      <p
        className="mt-3 text-center font-mono text-[10px] uppercase text-[var(--color-text-tertiary)]"
        style={{ letterSpacing: "0.22em" }}
      >
        scripted replay — the live agent answers for real
      </p>
    </div>
  );
}
