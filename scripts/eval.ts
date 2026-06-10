/* Runs every YAML under `evals/questions/` through `answer()` against the
 * real model. Requires ANTHROPIC_API_KEY. Exits non-zero if any eval fails. */
import fs from "node:fs";
import path from "node:path";
import { loadContent } from "@/lib/kb/loader";
import { assembleContentText } from "@/lib/kb/assembler";
import { answer } from "@/lib/answerer";
import { loadEvals } from "@/evals/index";
import { evaluateAnswer, type EvalResult } from "@/evals/run";

// This script runs standalone via `tsx`, which (unlike Next.js) does not load
// `.env.local` automatically. Load it here so `pnpm evals` works without the
// caller needing to export ANTHROPIC_API_KEY by hand.
if (fs.existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

async function readStreamToText(stream: AsyncIterable<string>): Promise<string> {
  let out = "";
  for await (const chunk of stream) out += chunk;
  return out;
}

async function main() {
  const root = process.cwd();
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set");
    process.exit(2);
  }
  // KB content lives in the external persona repo — point at a local checkout
  // via PERSONA_LOCAL_OVERRIDE (e.g. ../queryme-content-alex). Eval questions
  // stay in this repo under evals/questions.
  const contentRoot = process.env.PERSONA_LOCAL_OVERRIDE;
  if (!contentRoot) {
    console.error(
      "PERSONA_LOCAL_OVERRIDE is not set. Point it at a local persona repo " +
        "checkout, e.g. PERSONA_LOCAL_OVERRIDE=../queryme-content-alex pnpm evals",
    );
    process.exit(2);
  }
  const content = await loadContent(contentRoot);
  const kbText = assembleContentText(content);
  const questions = await loadEvals(path.join(root, "evals/questions"));

  const results: EvalResult[] = [];
  for (const q of questions) {
    process.stderr.write(`▶ ${q.id} … `);
    const stream = await answer({
      accountId: "local-override",
      messages: [{ role: "user", content: q.question }],
      kbText,
    });
    const text = await readStreamToText(stream.textStream);
    const r = evaluateAnswer(q, text);
    results.push(r);
    process.stderr.write(r.passed ? "PASS\n" : `FAIL (${r.failures.join("; ")})\n`);
  }

  const failed = results.filter((r) => !r.passed);
  const summary = {
    total: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    results,
  };
  console.log(JSON.stringify(summary, null, 2));
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
