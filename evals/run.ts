import { parseCitations } from "@/lib/kb/citations";
import type { EvalQuestion } from "./schema";

export type EvalResult = {
  id: string;
  passed: boolean;
  failures: string[];
  answer: string;
};

export function evaluateAnswer(q: EvalQuestion, answer: string): EvalResult {
  const failures: string[] = [];
  const text = answer.trim();
  if (!text) {
    failures.push("answer is empty");
    return { id: q.id, passed: false, failures, answer };
  }
  const cited = new Set(parseCitations(answer).map((c) => c.path));
  for (const required of q.mustCite) {
    if (!cited.has(required)) {
      failures.push(`missing required citation: ${required}`);
    }
  }
  for (const phrase of q.mustContain) {
    if (!answer.includes(phrase)) {
      failures.push(`missing required phrase: ${phrase}`);
    }
  }
  for (const phrase of q.mustNotContain) {
    if (answer.includes(phrase)) {
      failures.push(`forbidden phrase present: ${phrase}`);
    }
  }
  return { id: q.id, passed: failures.length === 0, failures, answer };
}
