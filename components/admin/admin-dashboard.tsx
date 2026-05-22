"use client";

import { useState } from "react";
import type { AdminData, AdminStats } from "@/lib/admin/data";
import { CONVERSATION_LIMIT } from "@/lib/admin/data";
import type { Conversation, QuestionForAlex, InterviewerIdentity } from "@/lib/db/schema";
import { GridBackground } from "@/components/grid-background";
import { MatriceLogo } from "@/components/matrice-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { LogoutButton } from "@/components/admin/logout-button";
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
const CARD = "rounded-xl border border-[var(--color-border)] bg-[var(--color-card)]/60";

type TabId = "interviewers" | "conversations" | "questions";

export function AdminDashboard({ data }: { data: AdminData }) {
  const { stats, conversations, questions, interviewers } = data;
  const [tab, setTab] = useState<TabId>("interviewers");

  // Cross-link from an interviewer card: jump to the Conversations tab and
  // open + scroll to that conversation. The row only exists in the DOM once
  // the Conversations panel renders, so the scroll waits a frame.
  function openConversation(conversationId: string) {
    setTab("conversations");
    requestAnimationFrame(() => {
      const el = document.getElementById(`conv-${conversationId}`);
      if (el instanceof HTMLDetailsElement) {
        el.open = true;
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }

  const tabs: { id: TabId; label: string; count: number }[] = [
    { id: "interviewers", label: "Interviewers", count: interviewers.length },
    { id: "conversations", label: "Conversations", count: conversations.length },
    { id: "questions", label: "Questions", count: questions.length },
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

        <nav className="flex h-11 shrink-0 items-center border-b border-[var(--color-border)] px-2 sm:px-4">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? "page" : undefined}
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
        </nav>

        <div className="min-h-0 flex-1 overflow-auto px-4 py-6 sm:px-6">
          {tab === "interviewers" && (
            <InterviewersPanel interviewers={interviewers} onOpenConversation={openConversation} />
          )}
          {tab === "conversations" && <ConversationsPanel conversations={conversations} />}
          {tab === "questions" && <QuestionsPanel questions={questions} />}
        </div>
      </div>
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
  const stated = interviewers.filter((c) => c.interviewer?.basis === "stated").length;
  return <>{`${stated} stated · ${interviewers.length - stated} inferred`}</>;
}

function InterviewersPanel({
  interviewers,
  onOpenConversation,
}: {
  interviewers: Conversation[];
  onOpenConversation: (conversationId: string) => void;
}) {
  if (interviewers.length === 0) return <Empty>No interviewers identified yet.</Empty>;
  return (
    <div className="flex flex-col gap-2">
      {interviewers.map((c) => (
        <InterviewerCard
          key={c.id}
          conversation={c}
          identity={c.interviewer!}
          onOpen={onOpenConversation}
        />
      ))}
    </div>
  );
}

function ConversationsPanel({ conversations }: { conversations: Conversation[] }) {
  if (conversations.length === 0) return <Empty>No conversations yet.</Empty>;
  return (
    <div className="flex flex-col gap-2">
      {conversations.map((c) => (
        <ConversationRow key={c.id} conversation={c} />
      ))}
    </div>
  );
}

function QuestionsPanel({ questions }: { questions: QuestionForAlex[] }) {
  if (questions.length === 0) return <Empty>No forwarded questions.</Empty>;
  return (
    <div className="flex flex-col gap-2">
      {questions.map((q) => (
        <QuestionRow key={q.id} question={q} />
      ))}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-[var(--color-text-tertiary)]">{children}</p>;
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="rounded-full border border-[var(--color-border)] px-2 py-0.5 font-mono text-[9px] uppercase text-[var(--color-text-secondary)]"
      style={{ letterSpacing: "0.16em" }}
    >
      {children}
    </span>
  );
}

function ConversationRow({ conversation }: { conversation: Conversation }) {
  const turns = conversation.transcript ?? [];
  return (
    <details id={`conv-${conversation.id}`} className={`${CARD} group`}>
      <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-4 py-3 text-[13px] text-[var(--color-text-secondary)]">
        <Badge>{conversation.channel}</Badge>
        {conversation.language && <Badge>{conversation.language}</Badge>}
        {conversation.interviewer && (
          <Badge>{conversation.interviewer.name ?? "identified"}</Badge>
        )}
        <span className="ml-auto flex items-center gap-3 text-[var(--color-text-tertiary)]">
          <span>{turns.length} turns</span>
          <span>{fmt(conversation.lastMessageAt)}</span>
        </span>
      </summary>
      <div className="flex flex-col gap-3 border-t border-[var(--color-border)] px-4 py-3">
        <p className="font-mono text-[10px] text-[var(--color-text-tertiary)]">
          id {conversation.id} · started {fmt(conversation.startedAt)}
        </p>
        {turns.length === 0 ? (
          <Empty>Empty transcript.</Empty>
        ) : (
          turns.map((t, i) => (
            <div key={i} className="flex flex-col gap-1">
              <span className={LABEL}>
                {t.role} · {fmt(t.at)}
              </span>
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--color-text-primary)]">
                {t.text}
              </p>
            </div>
          ))
        )}
      </div>
    </details>
  );
}

function QuestionRow({ question }: { question: QuestionForAlex }) {
  return (
    <div className={`${CARD} flex flex-col gap-1.5 px-4 py-3`}>
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

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className={LABEL}>{label}</span>
      <span className="text-[13px] text-[var(--color-text-primary)]">{value}</span>
    </div>
  );
}

function InterviewerCard({
  conversation,
  identity,
  onOpen,
}: {
  conversation: Conversation;
  identity: InterviewerIdentity;
  onOpen: (conversationId: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(conversation.id)}
      className={cn(
        CARD,
        "flex w-full flex-col gap-3 px-4 py-3 text-left transition-colors",
        "hover:border-[var(--color-primary)] focus-visible:border-[var(--color-primary)]",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-display text-sm text-[var(--color-text-primary)]">
          {identity.name ?? "Unknown name"}
        </span>
        <Badge>{identity.basis}</Badge>
        <span className="ml-auto font-mono text-[10px] text-[var(--color-text-tertiary)]">
          {fmt(identity.updatedAt)}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {identity.company && <Field label="Company" value={identity.company} />}
        {identity.role && <Field label="Role" value={identity.role} />}
        {identity.hiringFor && <Field label="Hiring for" value={identity.hiringFor} />}
        {identity.contact && <Field label="Contact" value={identity.contact} />}
      </div>
      {identity.notes && (
        <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
          {identity.notes}
        </p>
      )}
    </button>
  );
}
