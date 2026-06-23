"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";
import type { ConversationTurn } from "@/lib/db/schema";
import { CONVERSATION_LIMIT, type ConversationListItem } from "@/lib/admin/data";
import { RecordList } from "@/components/admin/record-list";
import { StatTile } from "@/components/admin/ui";
import { DetailSidebar } from "@/components/admin/detail-sidebar";
import { ConversationRow } from "@/components/admin/rows/conversation-row";
import { ConversationDetail } from "@/components/admin/details/conversation-detail";
import { cn } from "@/lib/utils";

type Segment = "all" | "interviewers";

export function ConversationsSection({
  conversations,
  apiBasePath,
}: {
  conversations: ConversationListItem[];
  apiBasePath: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const selectedId = params.get("c");
  const [segment, setSegment] = useState<Segment>("all");
  const [transcript, setTranscript] = useState<ConversationTurn[] | null>(null);

  const interviewers = useMemo(
    () => conversations.filter((c) => c.interviewer != null),
    [conversations],
  );
  const shown = segment === "interviewers" ? interviewers : conversations;
  const selected = selectedId ? conversations.find((c) => c.id === selectedId) ?? null : null;
  const avgTurns = conversations.length
    ? Math.round(conversations.reduce((sum, c) => sum + c.turnCount, 0) / conversations.length)
    : 0;

  // The list payload omits transcripts; fetch the selected one on demand. While
  // it loads, `transcript` is null and the detail body shows a loading state.
  useEffect(() => {
    if (!selectedId) {
      setTranscript(null);
      return;
    }
    let cancelled = false;
    setTranscript(null);
    fetch(`${apiBasePath}/conversations/${selectedId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: { transcript: ConversationTurn[] }) => {
        if (!cancelled) setTranscript(d.transcript ?? []);
      })
      .catch(() => {
        if (!cancelled) setTranscript([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, apiBasePath]);

  function select(id: string | null) {
    const next = new URLSearchParams(params.toString());
    if (id) next.set("c", id);
    else next.delete("c");
    const qs = next.toString();
    router.push((qs ? `${pathname}?${qs}` : pathname) as Route);
  }

  return (
    <>
      {conversations.length > 0 && (
        <div className="mb-5 grid grid-cols-3 gap-3">
          <StatTile label="Conversations" value={conversations.length} />
          <StatTile label="Interviewers" value={interviewers.length} tone="accent" />
          <StatTile label="Avg turns" value={avgTurns} />
        </div>
      )}
      <div className="mb-4 flex items-center gap-2">
        <SegmentButton active={segment === "all"} onClick={() => setSegment("all")} label="All" count={conversations.length} />
        <SegmentButton
          active={segment === "interviewers"}
          onClick={() => setSegment("interviewers")}
          label="Interviewers"
          count={interviewers.length}
        />
      </div>
      {conversations.length === CONVERSATION_LIMIT && (
        <p className="mb-3 font-mono text-2xs uppercase text-[var(--color-text-tertiary)]">
          Showing most recent {CONVERSATION_LIMIT}
        </p>
      )}
      <RecordList
        items={shown}
        getId={(c) => c.id}
        selectedId={selectedId}
        onSelect={select}
        rowIdPrefix="conv"
        ariaLabel="Conversations"
        empty={segment === "interviewers" ? "No interviewers identified yet." : "No conversations yet."}
        renderRow={(c) => <ConversationRow conversation={c} />}
      />
      <DetailSidebar
        open={selected !== null}
        onClose={() => select(null)}
        eyebrow={selected?.interviewer ? "Interviewer" : "Conversation"}
        title={selected ? detailTitle(selected) : ""}
      >
        {selected && <ConversationDetail conversation={selected} transcript={transcript} />}
      </DetailSidebar>
    </>
  );
}

function detailTitle(c: ConversationListItem): string {
  if (c.interviewer) return c.interviewer.name ?? "Unknown name";
  return `${c.channel} · ${c.turnCount} turns`;
}

function SegmentButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-2xs uppercase transition-colors",
        active
          ? "border-[var(--color-accent)] text-[var(--color-accent)]"
          : "border-[var(--color-border)] text-[var(--color-text-tertiary)] hover:text-[var(--color-primary)]",
      )}
      style={{ letterSpacing: "0.18em" }}
    >
      {label}
      <span className="text-[var(--color-text-tertiary)]">{count}</span>
    </button>
  );
}
