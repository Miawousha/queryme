import { NextRequest } from "next/server";
import path from "node:path";
import { loadKb } from "@/lib/kb/loader";
import { assembleKbText } from "@/lib/kb/assembler";
import { answer } from "@/lib/answerer";
import { convertToModelMessages, type UIMessage } from "ai";

// Use the Node runtime so we can read files from the repo at runtime.
export const runtime = "nodejs";

let cachedKbText: string | null = null;

async function getKbText(): Promise<string> {
  if (cachedKbText !== null) return cachedKbText;
  const kbDir = path.resolve(process.cwd(), "kb");
  const kb = await loadKb(kbDir);
  cachedKbText = assembleKbText(kb);
  return cachedKbText;
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { messages: UIMessage[] };
  const kbText = await getKbText();

  const result = await answer({
    messages: convertToModelMessages(body.messages),
    kbText,
  });

  return result.toUIMessageStreamResponse();
}
