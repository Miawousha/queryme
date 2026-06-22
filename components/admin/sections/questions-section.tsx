"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";
import type { ForwardedQuestion } from "@/lib/db/schema";
import { QUESTION_LIMIT } from "@/lib/admin/data";
import { RecordList } from "@/components/admin/record-list";
import { DetailSidebar } from "@/components/admin/detail-sidebar";
import { QuestionRow } from "@/components/admin/rows/question-row";
import { QuestionDetail } from "@/components/admin/details/question-detail";

export function QuestionsSection({
  questions,
  apiBasePath,
  adminBasePath,
}: {
  questions: ForwardedQuestion[];
  apiBasePath: string;
  adminBasePath: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const selectedId = params.get("q");
  const selected = selectedId ? questions.find((q) => q.id === selectedId) ?? null : null;

  function select(id: string | null) {
    const next = new URLSearchParams(params.toString());
    if (id) next.set("q", id);
    else next.delete("q");
    const qs = next.toString();
    router.push((qs ? `${pathname}?${qs}` : pathname) as Route);
  }

  function openConversation(conversationId: string) {
    router.push(`${adminBasePath}?c=${conversationId}` as Route);
  }

  return (
    <>
      {questions.length === QUESTION_LIMIT && (
        <p className="mb-3 font-mono text-2xs uppercase text-[var(--color-text-tertiary)]">
          Showing most recent {QUESTION_LIMIT}
        </p>
      )}
      <RecordList
        items={questions}
        getId={(q) => q.id}
        selectedId={selectedId}
        onSelect={select}
        ariaLabel="Forwarded questions"
        empty="No forwarded questions."
        renderRow={(q) => <QuestionRow question={q} />}
      />
      <DetailSidebar open={selected !== null} onClose={() => select(null)} eyebrow="Question" title="Question">
        {selected && (
          <QuestionDetail
            key={selected.id}
            question={selected}
            apiBasePath={apiBasePath}
            onOpenConversation={openConversation}
          />
        )}
      </DetailSidebar>
    </>
  );
}
