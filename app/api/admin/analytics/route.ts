import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin/auth";
import { getDb } from "@/lib/db/client";
import { conversations, forwardedQuestions } from "@/lib/db/schema";
import {
  conversationsPerDay,
  topQuestionTopics,
  citationDensityPerConversation,
} from "@/lib/admin/analytics";

export const runtime = "nodejs";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = getDb();
  const convs = await db.select().from(conversations);
  const qs = await db.select().from(forwardedQuestions);
  return NextResponse.json({
    perDay: conversationsPerDay(convs, 30, new Date()),
    topics: topQuestionTopics(qs),
    // Drop conversations with no assistant turns (nothing to assess) and
    // surface low-citation answers first — they're the ones most likely
    // ungrounded and worth reviewing.
    density: convs
      .map((c) =>
        citationDensityPerConversation({ id: c.id, transcript: c.transcript ?? [] }),
      )
      .filter((d) => d.assistantTurns > 0)
      .sort((a, b) => a.avgCitations - b.avgCitations),
  });
}
