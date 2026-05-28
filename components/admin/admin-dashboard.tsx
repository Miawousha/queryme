"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { AdminData, AdminStats } from "@/lib/admin/data";
import { CONVERSATION_LIMIT } from "@/lib/admin/data";
import type { Conversation, ForwardedQuestion, InterviewerIdentity } from "@/lib/db/schema";
import { GridBackground } from "@/components/grid-background";
import { MatriceLogo } from "@/components/matrice-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { LogoutButton } from "@/components/admin/logout-button";
import { RecordList } from "@/components/admin/record-list";
import { DetailSidebar } from "@/components/admin/detail-sidebar";
import { ContentTab } from "@/components/admin/content-tab";
import { cn } from "@/lib/utils";

function fmt(value: Date | string | null): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    year: "2-digit",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const LABEL = "font-mono text-[10px] uppercase text-[var(--color-text-tertiary)]";

type TabId = "interviewers" | "conversations" | "questions" | "content" | "analytics";

export function AdminDashboard({ data }: { data: AdminData }) {
  const { stats, conversations, questions, interviewers } = data;
  const [tab, setTab] = useState<TabId>("interviewers");
  // One open record per tab — switching tabs preserves what was open in each.
  const [selected, setSelected] = useState<Record<TabId, string | null>>({
    interviewers: null,
    conversations: null,
    questions: null,
    content: null,
    analytics: null,
  });

  const selectedId = selected[tab];
  function select(id: string | null) {
    setSelected((s) => ({ ...s, [tab]: id }));
  }

  // Cross-link from an interviewer row: jump to the Conversations tab and
  // open that conversation's detail sidebar. The conversation list might not
  // be mounted yet, so we sequence with a microtask.
  function openConversation(conversationId: string) {
    setTab("conversations");
    setSelected((s) => ({ ...s, conversations: conversationId }));
  }

  // Lookup tables keep the detail-panel render trivial regardless of which
  // tab is active.
  const conversationById = useMemo(
    () => new Map(conversations.map((c) => [c.id, c])),
    [conversations],
  );
  const interviewerById = useMemo(
    () => new Map(interviewers.map((c) => [c.id, c])),
    [interviewers],
  );
  const questionById = useMemo(() => new Map(questions.map((q) => [q.id, q])), [questions]);

  // If the selected id is no longer in the data set (e.g. data refreshed),
  // drop it so the sidebar closes rather than showing stale framing.
  useEffect(() => {
    if (selected.interviewers && !interviewerById.has(selected.interviewers)) {
      setSelected((s) => ({ ...s, interviewers: null }));
    }
    if (selected.conversations && !conversationById.has(selected.conversations)) {
      setSelected((s) => ({ ...s, conversations: null }));
    }
    if (selected.questions && !questionById.has(selected.questions)) {
      setSelected((s) => ({ ...s, questions: null }));
    }
  }, [selected, interviewerById, conversationById, questionById]);

  const tabs: { id: TabId; label: string; count: number }[] = [
    { id: "interviewers", label: "Interviewers", count: interviewers.length },
    { id: "conversations", label: "Conversations", count: conversations.length },
    { id: "questions", label: "Questions", count: questions.length },
    { id: "content", label: "Content", count: 0 },
    { id: "analytics", label: "Analytics", count: 0 },
  ];

  return (
    <>
      <GridBackground />
      <div className="relative z-10 flex h-dvh flex-col">
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-[var(--color-border)] bg-[var(--color-surface)]/60 px-4 py-2.5 backdrop-blur sm:px-6">
          <h1 className="sr-only">queryme — Admin</h1>
          <div className="flex shrink-0 items-center gap-3">
            <MatriceLogo size={28} animated />
            <div className="flex flex-col leading-tight">
              <span
                className="whitespace-nowrap font-mono text-[10px] uppercase text-[var(--color-primary)]"
                style={{ letterSpacing: "0.32em" }}
              >
                queryme
              </span>
              <span
                className="whitespace-nowrap font-display text-[14px] font-medium text-[var(--color-text-primary)]"
                style={{ letterSpacing: "-0.01em" }}
              >
                Admin
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggle label="Switch between light and dark theme" />
            <LogoutButton />
          </div>
        </header>

        <div
          role="tablist"
          aria-label="Admin sections"
          className="flex h-11 shrink-0 items-center border-b border-[var(--color-border)] px-2 sm:px-4"
        >
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`panel-${t.id}`}
              onClick={() => setTab(t.id)}
              className={cn(
                "relative flex h-full items-center gap-1.5 px-3 font-mono text-[10px] uppercase transition-colors",
                "after:absolute after:inset-x-3 after:-bottom-px after:h-[2px] after:content-['']",
                tab === t.id
                  ? "text-[var(--color-accent)] after:bg-[var(--color-accent)]"
                  : "text-[var(--color-text-tertiary)] after:bg-transparent hover:text-[var(--color-primary)]",
              )}
              style={{ letterSpacing: "0.18em" }}
            >
              {t.label}
              <span className="text-[var(--color-text-tertiary)]">{t.count}</span>
            </button>
          ))}
          <span
            className="ml-auto truncate pl-3 pr-1 font-mono text-[10px] uppercase text-[var(--color-text-tertiary)]"
            style={{ letterSpacing: "0.14em" }}
          >
            <TabMeta tab={tab} stats={stats} interviewers={interviewers} />
          </span>
        </div>

        <div
          role="tabpanel"
          id={`panel-${tab}`}
          aria-labelledby={`tab-${tab}`}
          className="min-h-0 flex-1 overflow-auto px-4 py-6 sm:px-6"
        >
          {tab === "interviewers" && (
            <RecordList
              items={interviewers}
              getId={(c) => c.id}
              selectedId={selectedId}
              onSelect={select}
              ariaLabel="Identified interviewers"
              empty="No interviewers identified yet."
              renderRow={(c) => <InterviewerRow conversation={c} identity={c.interviewer!} />}
            />
          )}
          {tab === "conversations" && (
            <RecordList
              items={conversations}
              getId={(c) => c.id}
              selectedId={selectedId}
              onSelect={select}
              rowIdPrefix="conv"
              ariaLabel="Conversations"
              empty="No conversations yet."
              renderRow={(c) => <ConversationRow conversation={c} />}
            />
          )}
          {tab === "questions" && (
            <RecordList
              items={questions}
              getId={(q) => q.id}
              selectedId={selectedId}
              onSelect={select}
              ariaLabel="Forwarded questions"
              empty="No forwarded questions."
              renderRow={(q) => <QuestionRow question={q} />}
            />
          )}
          {tab === "content" && <ContentTab />}
          {tab === "analytics" && <AnalyticsPanel />}
        </div>
      </div>

      <DetailSidebar
        open={tab !== "content" && tab !== "analytics" && selectedId !== null}
        onClose={() => select(null)}
        eyebrow={
          tab === "interviewers"
            ? "Interviewer"
            : tab === "conversations"
              ? "Conversation"
              : "Question"
        }
        title={
          tab === "interviewers"
            ? (selectedId && interviewerById.get(selectedId)?.interviewer?.name) ||
              "Unknown name"
            : tab === "conversations"
              ? selectedId && conversationById.get(selectedId)
                ? `${conversationById.get(selectedId)!.channel} · ${
                    (conversationById.get(selectedId)!.transcript ?? []).length
                  } turns`
                : "Conversation"
              : "Question"
        }
      >
        {tab === "interviewers" && selectedId && interviewerById.has(selectedId) && (
          <InterviewerDetail
            conversation={interviewerById.get(selectedId)!}
            onOpenConversation={openConversation}
          />
        )}
        {tab === "conversations" && selectedId && conversationById.has(selectedId) && (
          <ConversationDetail conversation={conversationById.get(selectedId)!} />
        )}
        {tab === "questions" && selectedId && questionById.has(selectedId) && (
          <QuestionDetail
            key={selectedId}
            question={questionById.get(selectedId)!}
            onOpenConversation={openConversation}
          />
        )}
      </DetailSidebar>
    </>
  );
}

/** The active tab's secondary metric, shown at the right of the tab band. */
function TabMeta({
  tab,
  stats,
  interviewers,
}: {
  tab: TabId;
  stats: AdminStats;
  interviewers: Conversation[];
}) {
  if (tab === "conversations") {
    const capped =
      stats.conversations >= CONVERSATION_LIMIT ? ` · most recent ${CONVERSATION_LIMIT}` : "";
    return <>{`${stats.chat} chat · ${stats.mcp} mcp${capped}`}</>;
  }
  if (tab === "questions") {
    return <>{stats.unanswered > 0 ? `${stats.unanswered} unanswered` : "all answered"}</>;
  }
  if (tab === "analytics" || tab === "content") return null;
  const stated = interviewers.filter((c) => c.interviewer?.basis === "stated").length;
  return <>{`${stated} stated · ${interviewers.length - stated} inferred`}</>;
}

type AnalyticsData = {
  perDay: { date: string; count: number }[];
  topics: { topic: string; count: number }[];
  density: { conversationId: string; assistantTurns: number; avgCitations: number }[];
};

function AnalyticsPanel() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/admin/analytics")
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  if (error) return <p className="text-xs text-red-400">{error}</p>;
  if (!data)
    return (
      <p className="font-mono text-[10px] uppercase text-[var(--color-text-tertiary)]">
        Loading…
      </p>
    );

  const maxDay = Math.max(1, ...data.perDay.map((d) => d.count));
  const maxTopic = Math.max(1, ...data.topics.map((t) => t.count));

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-2">
        <span className={LABEL}>Conversations per day (last 30)</span>
        <svg viewBox="0 0 300 60" preserveAspectRatio="none" className="h-16 w-full">
          {data.perDay.map((d, i) => {
            const x = (i / Math.max(1, data.perDay.length - 1)) * 300;
            const h = (d.count / maxDay) * 56;
            return (
              <rect
                key={d.date}
                x={x - 3}
                y={60 - h}
                width={6}
                height={h}
                fill="var(--color-accent)"
                opacity={0.85}
              />
            );
          })}
        </svg>
      </section>

      <section className="flex flex-col gap-2">
        <span className={LABEL}>Top forwarded-question topics</span>
        <div className="flex flex-col gap-1">
          {data.topics.length === 0 && (
            <p className="text-xs text-[var(--color-text-tertiary)]">No data yet.</p>
          )}
          {data.topics.map((t) => (
            <div key={t.topic} className="flex items-center gap-3">
              <span className="w-24 font-mono text-[10px] uppercase text-[var(--color-text-secondary)]">
                {t.topic}
              </span>
              <div className="h-2 flex-1 rounded bg-[var(--color-border)]">
                <div
                  className="h-2 rounded bg-[var(--color-primary)]"
                  style={{ width: `${(t.count / maxTopic) * 100}%` }}
                />
              </div>
              <span className="w-8 text-right font-mono text-[10px] text-[var(--color-text-tertiary)]">
                {t.count}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <span className={LABEL}>Citation density per conversation</span>
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-left font-mono text-[10px] uppercase text-[var(--color-text-tertiary)]">
              <th className="py-1.5 pr-3">Conversation</th>
              <th className="py-1.5 pr-3">Assistant turns</th>
              <th className="py-1.5">Avg citations</th>
            </tr>
          </thead>
          <tbody>
            {data.density.map((d) => (
              <tr key={d.conversationId} className="border-b border-[var(--color-border)]/40">
                <td className="py-1.5 pr-3 font-mono text-[10px] text-[var(--color-text-secondary)]">
                  {d.conversationId.slice(0, 8)}
                </td>
                <td className="py-1.5 pr-3">{d.assistantTurns}</td>
                <td className="py-1.5">{d.avgCitations.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Badge({ children }: { children: ReactNode }) {
  return (
    <span
      className="rounded-full border border-[var(--color-border)] px-2 py-0.5 font-mono text-[9px] uppercase text-[var(--color-text-secondary)]"
      style={{ letterSpacing: "0.16em" }}
    >
      {children}
    </span>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className={LABEL}>{label}</span>
      <span className="text-[13px] text-[var(--color-text-primary)]">{value}</span>
    </div>
  );
}

// -------- Row renderers (compact, list-cell content) --------------------

function ConversationRow({ conversation }: { conversation: Conversation }) {
  const turns = conversation.transcript ?? [];
  return (
    <div className="flex flex-wrap items-center gap-2 text-[13px] text-[var(--color-text-secondary)]">
      <Badge>{conversation.channel}</Badge>
      {conversation.language && <Badge>{conversation.language}</Badge>}
      {conversation.interviewer && (
        <Badge>{conversation.interviewer.name ?? "identified"}</Badge>
      )}
      <span className="ml-auto flex items-center gap-3 text-[var(--color-text-tertiary)]">
        <span>{turns.length} turns</span>
        <span>{fmt(conversation.lastMessageAt)}</span>
      </span>
    </div>
  );
}

function QuestionRow({ question }: { question: ForwardedQuestion }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[13px] text-[var(--color-text-primary)]">{question.question}</p>
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-text-tertiary)]">
        <span>{fmt(question.createdAt)}</span>
        {question.answeredAt ? (
          <span className="font-mono text-[9px] uppercase text-[var(--color-text-secondary)]">
            answered {fmt(question.answeredAt)}
          </span>
        ) : (
          <span className="font-mono text-[9px] uppercase text-[var(--color-accent)]">
            unanswered
          </span>
        )}
      </div>
    </div>
  );
}

function InterviewerRow({
  conversation,
  identity,
}: {
  conversation: Conversation;
  identity: InterviewerIdentity;
}) {
  const subtitle = [identity.role, identity.company].filter(Boolean).join(" · ");
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-display text-sm text-[var(--color-text-primary)]">
          {identity.name ?? "Unknown name"}
        </span>
        <Badge>{identity.basis}</Badge>
        <span className="ml-auto font-mono text-[10px] text-[var(--color-text-tertiary)]">
          {fmt(conversation.lastMessageAt)}
        </span>
      </div>
      {subtitle && (
        <span className="text-[12px] text-[var(--color-text-tertiary)]">{subtitle}</span>
      )}
    </div>
  );
}

// -------- Detail renderers (sidebar body) --------------------------------

function ConversationDetail({ conversation }: { conversation: Conversation }) {
  const turns = conversation.transcript ?? [];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge>{conversation.channel}</Badge>
        {conversation.language && <Badge>{conversation.language}</Badge>}
        {conversation.interviewer && (
          <Badge>{conversation.interviewer.name ?? "identified"}</Badge>
        )}
        <span className="ml-auto font-mono text-[10px] text-[var(--color-text-tertiary)]">
          {turns.length} turns
        </span>
      </div>
      <p className="font-mono text-[10px] text-[var(--color-text-tertiary)]">
        id {conversation.id} · started {fmt(conversation.startedAt)} · last{" "}
        {fmt(conversation.lastMessageAt)}
      </p>
      {turns.length === 0 ? (
        <p className="text-xs text-[var(--color-text-tertiary)]">Empty transcript.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {turns.map((t, i) => (
            <div key={i} className="flex flex-col gap-1">
              <span className={LABEL}>
                {t.role} · {fmt(t.at)}
              </span>
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--color-text-primary)]">
                {t.text}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function InterviewerDetail({
  conversation,
  onOpenConversation,
}: {
  conversation: Conversation;
  onOpenConversation: (conversationId: string) => void;
}) {
  const identity = conversation.interviewer!;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge>{identity.basis}</Badge>
        <span className="ml-auto font-mono text-[10px] text-[var(--color-text-tertiary)]">
          updated {fmt(identity.updatedAt)}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {identity.company && <Field label="Company" value={identity.company} />}
        {identity.role && <Field label="Role" value={identity.role} />}
        {identity.hiringFor && <Field label="Hiring for" value={identity.hiringFor} />}
        {identity.contact && <Field label="Contact" value={identity.contact} />}
      </div>
      {identity.notes && (
        <div className="flex flex-col gap-1">
          <span className={LABEL}>Notes</span>
          <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
            {identity.notes}
          </p>
        </div>
      )}
      <button
        type="button"
        onClick={() => onOpenConversation(conversation.id)}
        className={cn(
          "self-start rounded-md border border-[var(--color-border)] px-3 py-1.5",
          "font-mono text-[10px] uppercase text-[var(--color-text-secondary)] transition-colors",
          "hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]",
          "focus-visible:outline-none focus-visible:border-[var(--color-primary)]",
        )}
        style={{ letterSpacing: "0.18em" }}
      >
        Open conversation →
      </button>
    </div>
  );
}

function QuestionDetail({
  question,
  onOpenConversation,
}: {
  question: ForwardedQuestion;
  onOpenConversation: (conversationId: string) => void;
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
      const res = await fetch(`/api/admin/questions/${question.id}/reply`, {
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
          <Badge>answered</Badge>
        ) : (
          <span
            className="rounded-full border border-[var(--color-accent)] px-2 py-0.5 font-mono text-[9px] uppercase text-[var(--color-accent)]"
            style={{ letterSpacing: "0.16em" }}
          >
            unanswered
          </span>
        )}
        <span className="ml-auto font-mono text-[10px] text-[var(--color-text-tertiary)]">
          {fmt(question.createdAt)}
        </span>
      </div>
      <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-[var(--color-text-primary)]">
        {question.question}
      </p>
      {question.contact && (
        <Field label="Visitor contact" value={question.contact} />
      )}
      <div className="flex flex-col gap-1">
        <span className={LABEL}>Reply</span>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={6}
          className="rounded-md border border-[var(--color-border)] bg-transparent p-2 text-[13px]"
          placeholder="Write the reply Alexandre wants to send…"
        />
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] text-[var(--color-text-tertiary)]">
            {question.contact ? "Will email the visitor on send." : "No contact — saved locally only."}
          </span>
          <button
            type="button"
            disabled={busy || !draft.trim()}
            onClick={submit}
            className={cn(
              "rounded-md border border-[var(--color-border)] px-3 py-1.5 font-mono text-[10px] uppercase",
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
            "font-mono text-[10px] uppercase text-[var(--color-text-secondary)] transition-colors",
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
