import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin/auth";
import { getDb } from "@/lib/db/client";
import { conversations, questionsForAlex } from "@/lib/db/schema";
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
  const qs = await db.select().from(questionsForAlex);
  return NextResponse.json({
    perDay: conversationsPerDay(convs, 30, new Date()),
    topics: topQuestionTopics(qs),
    density: convs.map((c) =>
      citationDensityPerConversation({ id: c.id, transcript: c.transcript ?? [] }),
    ),
  });
}
