import type { AdminData } from "@/lib/admin/data";
import { CONVERSATION_LIMIT } from "@/lib/admin/data";
import type { Asker, Conversation, QuestionForAlex } from "@/lib/db/schema";
import { LogoutButton } from "@/components/admin/logout-button";

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

export function AdminDashboard({ data }: { data: AdminData }) {
  const { stats, conversations, askersById, questions } = data;

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 px-5 py-10 sm:px-8">
      <header className="flex items-center justify-between">
        <div className="flex flex-col leading-tight">
          <span className={LABEL} style={{ letterSpacing: "0.32em" }}>
            queryme
          </span>
          <h1 className="font-display text-lg font-medium text-[var(--color-text-primary)]">
            Admin dashboard
          </h1>
        </div>
        <LogoutButton />
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Conversations" value={stats.conversations} />
        <Stat label="Chat / MCP" value={`${stats.chat} / ${stats.mcp}`} />
        <Stat label="Identified" value={stats.askers} />
        <Stat
          label="Questions"
          value={`${stats.questions}`}
          hint={stats.unanswered > 0 ? `${stats.unanswered} unanswered` : "all answered"}
        />
      </section>

      <Section
        title="Conversations"
        count={conversations.length}
        note={
          conversations.length >= CONVERSATION_LIMIT
            ? `most recent ${CONVERSATION_LIMIT}`
            : undefined
        }
      >
        {conversations.length === 0 ? (
          <Empty>No conversations yet.</Empty>
        ) : (
          <div className="flex flex-col gap-2">
            {conversations.map((c) => (
              <ConversationRow
                key={c.id}
                conversation={c}
                asker={c.askerId ? askersById[c.askerId] : undefined}
              />
            ))}
          </div>
        )}
      </Section>

      <Section title="Forwarded questions" count={questions.length}>
        {questions.length === 0 ? (
          <Empty>No forwarded questions.</Empty>
        ) : (
          <div className="flex flex-col gap-2">
            {questions.map((q) => (
              <QuestionRow
                key={q.id}
                question={q}
                asker={q.askerId ? askersById[q.askerId] : undefined}
              />
            ))}
          </div>
        )}
      </Section>

      <Section title="Identified askers" count={Object.keys(askersById).length}>
        {Object.keys(askersById).length === 0 ? (
          <Empty>Nobody has identified yet.</Empty>
        ) : (
          <div className="flex flex-col gap-2">
            {Object.values(askersById).map((a) => (
              <AskerRow key={a.id} asker={a} />
            ))}
          </div>
        )}
      </Section>
    </main>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className={`${CARD} flex flex-col gap-1 px-4 py-3`}>
      <span className={LABEL} style={{ letterSpacing: "0.24em" }}>
        {label}
      </span>
      <span className="font-display text-xl text-[var(--color-text-primary)]">{value}</span>
      {hint && <span className="text-[11px] text-[var(--color-text-tertiary)]">{hint}</span>}
    </div>
  );
}

function Section({
  title,
  count,
  note,
  children,
}: {
  title: string;
  count: number;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline gap-2 border-b border-[var(--color-border)] pb-2">
        <h2 className="font-display text-sm font-medium text-[var(--color-text-primary)]">
          {title}
        </h2>
        <span className={LABEL}>{count}</span>
        {note && <span className="text-[11px] text-[var(--color-text-tertiary)]">· {note}</span>}
      </div>
      {children}
    </section>
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

function ConversationRow({
  conversation,
  asker,
}: {
  conversation: Conversation;
  asker: Asker | undefined;
}) {
  const turns = conversation.transcript ?? [];
  return (
    <details className={`${CARD} group`}>
      <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-4 py-3 text-[13px] text-[var(--color-text-secondary)]">
        <Badge>{conversation.channel}</Badge>
        {conversation.language && <Badge>{conversation.language}</Badge>}
        <span className="text-[var(--color-text-primary)]">
          {asker ? `${asker.name} · ${asker.company}` : "Anonymous"}
        </span>
        {conversation.sensitiveUnlockedAt && (
          <span className="font-mono text-[9px] uppercase text-[var(--color-accent)]">
            unlocked
          </span>
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

function QuestionRow({
  question,
  asker,
}: {
  question: QuestionForAlex;
  asker: Asker | undefined;
}) {
  return (
    <div className={`${CARD} flex flex-col gap-1.5 px-4 py-3`}>
      <p className="text-[13px] text-[var(--color-text-primary)]">{question.question}</p>
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-text-tertiary)]">
        <span>{asker ? `${asker.name} · ${asker.company}` : "Anonymous"}</span>
        <span>· {fmt(question.createdAt)}</span>
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

function AskerRow({ asker }: { asker: Asker }) {
  return (
    <div className={`${CARD} flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-[13px]`}>
      <span className="text-[var(--color-text-primary)]">{asker.name}</span>
      <span className="text-[var(--color-text-secondary)]">{asker.company}</span>
      <Badge>{asker.role}</Badge>
      <a
        href={`mailto:${asker.workEmail}`}
        className="font-mono text-[11px] text-[var(--color-accent)]"
      >
        {asker.workEmail}
      </a>
      <span className="ml-auto font-mono text-[10px] text-[var(--color-text-tertiary)]">
        {asker.verifiedAt ? `verified ${fmt(asker.verifiedAt)}` : "unverified"}
      </span>
    </div>
  );
}
